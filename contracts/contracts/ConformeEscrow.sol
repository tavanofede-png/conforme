// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ConformeEscrow
/// @notice Custodia de pagos de comercio exterior: el importador bloquea los fondos y el
/// árbitro (el verificador de documentos) los libera al proveedor cuando la documentación
/// de embarque es conforme. Si vence el plazo sin liberar, el importador recupera los fondos.
contract ConformeEscrow {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Funded,
        Released,
        Refunded
    }

    struct Deal {
        address buyer;
        address seller;
        IERC20 token;
        uint256 amount;
        uint64 deadline;
        Status status;
        bytes32 docsHash;
    }

    address public immutable arbiter;
    mapping(bytes32 => Deal) public deals;

    event Funded(
        bytes32 indexed dealId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        uint64 deadline
    );
    event Released(bytes32 indexed dealId, address indexed seller, uint256 amount, bytes32 docsHash);
    event Refunded(bytes32 indexed dealId, address indexed buyer, uint256 amount);

    error InvalidParams();
    error DealExists();
    error NotFunded();
    error NotArbiter();
    error NotAllowed();

    constructor(address arbiter_) {
        if (arbiter_ == address(0)) revert InvalidParams();
        arbiter = arbiter_;
    }

    /// @notice El importador bloquea `amount` de `token` para la operación `dealId`.
    /// Requiere un `approve` previo del token a este contrato.
    function fund(bytes32 dealId, address seller, IERC20 token, uint256 amount, uint64 deadline) external {
        if (deals[dealId].status != Status.None) revert DealExists();
        if (seller == address(0) || address(token) == address(0) || amount == 0 || deadline <= block.timestamp) {
            revert InvalidParams();
        }

        deals[dealId] = Deal({
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            deadline: deadline,
            status: Status.Funded,
            docsHash: bytes32(0)
        });

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(dealId, msg.sender, seller, address(token), amount, deadline);
    }

    /// @notice El árbitro libera el pago al proveedor y deja registrado el hash del juego de
    /// documentos que se aprobó.
    function release(bytes32 dealId, bytes32 docsHash) external {
        if (msg.sender != arbiter) revert NotArbiter();
        Deal storage deal = deals[dealId];
        if (deal.status != Status.Funded) revert NotFunded();

        deal.status = Status.Released;
        deal.docsHash = docsHash;

        deal.token.safeTransfer(deal.seller, deal.amount);
        emit Released(dealId, deal.seller, deal.amount, docsHash);
    }

    /// @notice Devuelve los fondos al importador. El árbitro puede hacerlo en cualquier momento
    /// (por ejemplo, ante documentos fraudulentos); el importador, solo después del plazo.
    function refund(bytes32 dealId) external {
        Deal storage deal = deals[dealId];
        if (deal.status != Status.Funded) revert NotFunded();
        bool buyerAfterDeadline = msg.sender == deal.buyer && block.timestamp >= deal.deadline;
        if (msg.sender != arbiter && !buyerAfterDeadline) revert NotAllowed();

        deal.status = Status.Refunded;

        deal.token.safeTransfer(deal.buyer, deal.amount);
        emit Refunded(dealId, deal.buyer, deal.amount);
    }
}
