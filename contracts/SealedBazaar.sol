// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Fixed-price evaluation reports. Hashes prove byte identity, not scientific truth.
contract SealedBazaar {
    enum Status { None, Funded, Delivered, Disputed, Accepted, Refunded }
    struct Listing { address seller; bytes32 digest; uint256 price; uint256 bond; string metadataURI; }
    struct Trade { uint256 listingId; address buyer; Status status; uint64 deadline; bytes32 requestKey; bytes32 evidence; }
    IToken public immutable token;
    address public immutable arbiter;
    uint64 public immutable deliveryWindow;
    uint64 public immutable reviewWindow;
    uint64 public immutable arbitrationWindow;
    uint256 public listingCount;
    uint256 public tradeCount;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Trade) public trades;
    mapping(address => mapping(bytes32 => uint256)) public requestTrade;
    mapping(address => uint256) public acceptedSales;
    mapping(address => uint256) public refundedSales;
    mapping(address => uint256) public sellerFaults;
    uint256 private entered;
    modifier guard() { require(entered == 0, "Reentrant"); entered = 1; _; entered = 0; }
    event Listed(uint256 indexed id, address indexed seller, bytes32 digest, uint256 price);
    event Purchased(uint256 indexed id, uint256 indexed listingId, address indexed buyer, bytes32 requestKey);
    event Delivered(uint256 indexed id);
    event Challenged(uint256 indexed id, bytes32 evidence);
    event Settled(uint256 indexed id, bool refunded, bool bondSlashed);
    event BondWithdrawn(uint256 indexed listingId, uint256 amount);

    constructor(address token_, address arbiter_, uint64 delivery_, uint64 review_, uint64 arbitration_) {
        require(token_ != address(0) && arbiter_ != address(0), "Zero address");
        require(delivery_ > 0 && review_ > 0 && arbitration_ > 0, "Zero window");
        token = IToken(token_); arbiter = arbiter_;
        deliveryWindow = delivery_; reviewWindow = review_; arbitrationWindow = arbitration_;
    }
    function list(bytes32 digest, uint256 price, uint256 bond, string calldata metadataURI) external guard returns(uint256 id) {
        require(digest != bytes32(0) && price > 0 && bond >= price, "Invalid listing");
        require(bytes(metadataURI).length <= 512, "URI too long");
        require(token.transferFrom(msg.sender, address(this), bond), "Bond failed");
        id = listingCount++;
        listings[id] = Listing(msg.sender, digest, price, bond, metadataURI);
        emit Listed(id, msg.sender, digest, price);
    }
    function topUpBond(uint256 listingId, uint256 amount) external guard {
        Listing storage l = listings[listingId]; require(l.seller == msg.sender, "Not seller");
        require(token.transferFrom(msg.sender, address(this), amount), "Bond failed"); l.bond += amount;
    }
    /// @notice Only unreserved collateral can be withdrawn. Active trade bonds are separate.
    function withdrawBond(uint256 listingId, uint256 amount) external guard {
        Listing storage l = listings[listingId]; require(l.seller == msg.sender, "Not seller");
        require(amount > 0 && amount <= l.bond, "Insufficient free bond");
        l.bond -= amount;
        require(token.transfer(msg.sender, amount), "Transfer failed");
        emit BondWithdrawn(listingId, amount);
    }
    function buy(uint256 listingId, bytes32 requestKey) external guard returns(uint256 id) {
        Listing storage l = listings[listingId];
        require(l.seller != address(0) && msg.sender != l.seller, "Invalid parties");
        require(requestKey != bytes32(0) && requestTrade[msg.sender][requestKey] == 0, "Duplicate request");
        require(l.bond >= l.price, "Insufficient seller bond");
        l.bond -= l.price;
        id = ++tradeCount;
        requestTrade[msg.sender][requestKey] = id;
        trades[id] = Trade(listingId, msg.sender, Status.Funded, uint64(block.timestamp) + deliveryWindow, requestKey, bytes32(0));
        require(token.transferFrom(msg.sender, address(this), l.price), "Payment failed");
        emit Purchased(id, listingId, msg.sender, requestKey);
    }
    function markDelivered(uint256 id) external {
        Trade storage t = trades[id];
        require(t.status == Status.Funded && block.timestamp <= t.deadline, "Not deliverable");
        require(msg.sender == listings[t.listingId].seller, "Not seller");
        t.status = Status.Delivered; t.deadline = uint64(block.timestamp) + reviewWindow;
        emit Delivered(id);
    }
    function accept(uint256 id) external guard {
        Trade storage t = trades[id];
        require(msg.sender == t.buyer && t.status == Status.Delivered, "Not acceptable");
        _settle(id, false, false);
    }
    function dispute(uint256 id, bytes32 evidence) external {
        Trade storage t = trades[id];
        require(msg.sender == t.buyer && t.status == Status.Delivered && block.timestamp <= t.deadline, "Not disputable");
        require(evidence != bytes32(0), "Missing evidence");
        t.status = Status.Disputed; t.evidence = evidence; t.deadline = uint64(block.timestamp) + arbitrationWindow;
        emit Challenged(id, evidence);
    }
    function resolve(uint256 id, bool refund) external guard {
        require(msg.sender == arbiter, "Not arbiter");
        require(trades[id].status == Status.Disputed && block.timestamp <= trades[id].deadline, "Not resolvable");
        _settle(id, refund, refund);
    }
    /// @notice Permissionless liveness: missing delivery refunds + slashes; silent buyer pays;
    /// arbiter silence refunds principal but does not slash an unadjudicated seller.
    function finalizeExpired(uint256 id) external guard {
        Trade storage t = trades[id]; require(block.timestamp > t.deadline, "Not expired");
        require(t.status == Status.Funded || t.status == Status.Delivered || t.status == Status.Disputed, "Already terminal");
        _settle(id, t.status != Status.Delivered, t.status == Status.Funded);
    }
    function _settle(uint256 id, bool refund, bool slash) internal {
        Trade storage t = trades[id]; Listing storage l = listings[t.listingId];
        t.status = refund ? Status.Refunded : Status.Accepted;
        if (!slash) l.bond += l.price;
        if (refund) refundedSales[l.seller]++; else acceptedSales[l.seller]++;
        if (slash) sellerFaults[l.seller]++;
        require(token.transfer(refund ? t.buyer : l.seller, l.price + (slash ? l.price : 0)), "Transfer failed");
        emit Settled(id, refund, slash);
    }
}
