const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const USD = (n) => ethers.parseUnits(String(n), 6);
const dealIdOf = (opId) => ethers.id(opId);

async function now() {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}

async function increaseTime(seconds) {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

describe("ConformeEscrow", () => {
  let escrow, token, arbiter, buyer, seller, stranger;
  const dealId = dealIdOf("op-llantas-001");
  const docsHash = ethers.id("factura+packing+bl");

  beforeEach(async () => {
    [arbiter, buyer, seller, stranger] = await ethers.getSigners();
    token = await ethers.deployContract("TestUSD", [arbiter.address]);
    escrow = await ethers.deployContract("ConformeEscrow", [arbiter.address]);
    await token.mint(buyer.address, USD(100_000));
    await token.connect(buyer).approve(await escrow.getAddress(), USD(100_000));
  });

  async function fund(amount = USD(24_000), deadlineOffset = 30 * 24 * 3600) {
    const deadline = (await now()) + deadlineOffset;
    await escrow.connect(buyer).fund(dealId, seller.address, await token.getAddress(), amount, deadline);
    return deadline;
  }

  it("rechaza un árbitro nulo en el constructor", async () => {
    const factory = await ethers.getContractFactory("ConformeEscrow");
    await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "InvalidParams");
  });

  describe("fund", () => {
    it("bloquea los fondos del importador en el contrato", async () => {
      const deadline = (await now()) + 3600;
      const tx = escrow.connect(buyer).fund(dealId, seller.address, await token.getAddress(), USD(24_000), deadline);
      await expect(tx).to.changeTokenBalances(token, [buyer, escrow], [-USD(24_000), USD(24_000)]);
      const deal = await escrow.deals(dealId);
      expect(deal.buyer).to.equal(buyer.address);
      expect(deal.seller).to.equal(seller.address);
      expect(deal.amount).to.equal(USD(24_000));
      expect(deal.status).to.equal(1n);
    });

    it("emite el evento Funded", async () => {
      const deadline = (await now()) + 3600;
      await expect(
        escrow.connect(buyer).fund(dealId, seller.address, await token.getAddress(), USD(10), deadline),
      )
        .to.emit(escrow, "Funded")
        .withArgs(dealId, buyer.address, seller.address, await token.getAddress(), USD(10), deadline);
    });

    it("no permite fondear dos veces la misma operación", async () => {
      await fund();
      await expect(fund()).to.be.revertedWithCustomError(escrow, "DealExists");
    });

    it("valida proveedor, token, monto y plazo", async () => {
      const t = await token.getAddress();
      const future = (await now()) + 3600;
      const past = (await now()) - 1;
      const f = (seller_, token_, amount, deadline) =>
        escrow.connect(buyer).fund(dealId, seller_, token_, amount, deadline);

      await expect(f(ethers.ZeroAddress, t, USD(1), future)).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await expect(f(seller.address, ethers.ZeroAddress, USD(1), future)).to.be.revertedWithCustomError(
        escrow,
        "InvalidParams",
      );
      await expect(f(seller.address, t, 0, future)).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await expect(f(seller.address, t, USD(1), past)).to.be.revertedWithCustomError(escrow, "InvalidParams");
    });
  });

  describe("release", () => {
    it("solo el árbitro puede liberar", async () => {
      await fund();
      await expect(escrow.connect(buyer).release(dealId, docsHash)).to.be.revertedWithCustomError(
        escrow,
        "NotArbiter",
      );
      await expect(escrow.connect(seller).release(dealId, docsHash)).to.be.revertedWithCustomError(
        escrow,
        "NotArbiter",
      );
    });

    it("paga al proveedor y registra el hash de los documentos", async () => {
      await fund();
      await expect(escrow.release(dealId, docsHash)).to.changeTokenBalances(
        token,
        [escrow, seller],
        [-USD(24_000), USD(24_000)],
      );
      const deal = await escrow.deals(dealId);
      expect(deal.status).to.equal(2n);
      expect(deal.docsHash).to.equal(docsHash);
    });

    it("emite el evento Released", async () => {
      await fund();
      await expect(escrow.release(dealId, docsHash))
        .to.emit(escrow, "Released")
        .withArgs(dealId, seller.address, USD(24_000), docsHash);
    });

    it("no libera una operación sin fondos ni dos veces", async () => {
      await expect(escrow.release(dealId, docsHash)).to.be.revertedWithCustomError(escrow, "NotFunded");
      await fund();
      await escrow.release(dealId, docsHash);
      await expect(escrow.release(dealId, docsHash)).to.be.revertedWithCustomError(escrow, "NotFunded");
    });
  });

  describe("refund", () => {
    it("el importador no puede recuperar los fondos antes del plazo", async () => {
      await fund();
      await expect(escrow.connect(buyer).refund(dealId)).to.be.revertedWithCustomError(escrow, "NotAllowed");
    });

    it("el importador recupera los fondos después del plazo", async () => {
      await fund(USD(24_000), 3600);
      await increaseTime(3601);
      await expect(escrow.connect(buyer).refund(dealId)).to.changeTokenBalances(
        token,
        [escrow, buyer],
        [-USD(24_000), USD(24_000)],
      );
      expect((await escrow.deals(dealId)).status).to.equal(3n);
    });

    it("el árbitro puede devolver en cualquier momento", async () => {
      await fund();
      await expect(escrow.refund(dealId))
        .to.emit(escrow, "Refunded")
        .withArgs(dealId, buyer.address, USD(24_000));
    });

    it("un tercero nunca puede pedir la devolución", async () => {
      await fund(USD(24_000), 3600);
      await increaseTime(3601);
      await expect(escrow.connect(stranger).refund(dealId)).to.be.revertedWithCustomError(escrow, "NotAllowed");
    });

    it("no se puede devolver una operación ya liberada", async () => {
      await fund();
      await escrow.release(dealId, docsHash);
      await expect(escrow.refund(dealId)).to.be.revertedWithCustomError(escrow, "NotFunded");
    });

    it("no se puede liberar una operación ya devuelta", async () => {
      await fund();
      await escrow.refund(dealId);
      await expect(escrow.release(dealId, docsHash)).to.be.revertedWithCustomError(escrow, "NotFunded");
    });
  });
});
