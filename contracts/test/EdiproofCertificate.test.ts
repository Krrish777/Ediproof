import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("EdiproofCertificate", function () {
  async function deployFixture() {
    const [owner, institution, otherInstitution, student, stranger] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("EdiproofCertificate");
    const contract = await Factory.deploy(owner.address);
    await contract.waitForDeployment();

    await contract.connect(owner).addInstitution(institution.address);

    const sample = {
      name: "John Doe",
      course: "B.Tech Computer Science",
      institution: "MIT",
      ipfs: "ipfs://QmSampleHash1234567890",
    };

    return { contract, owner, institution, otherInstitution, student, stranger, sample };
  }

  describe("Institution management", function () {
    it("only owner can add institutions", async () => {
      const { contract, stranger, otherInstitution } = await loadFixture(deployFixture);
      await expect(
        contract.connect(stranger).addInstitution(otherInstitution.address)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("added institution is approved, removed is not", async () => {
      const { contract, owner, otherInstitution } = await loadFixture(deployFixture);
      await contract.connect(owner).addInstitution(otherInstitution.address);
      expect(await contract.approvedInstitutions(otherInstitution.address)).to.equal(true);
      await contract.connect(owner).removeInstitution(otherInstitution.address);
      expect(await contract.approvedInstitutions(otherInstitution.address)).to.equal(false);
    });
  });

  describe("Issue", function () {
    it("happy path: approved institution can issue", async () => {
      const { contract, institution, student, sample } = await loadFixture(deployFixture);
      const tx = await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
      expect(await contract.ownerOf(1)).to.equal(student.address);
      expect(await contract.totalCertificates()).to.equal(1);
    });

    it("emits CertificateIssued with correct args", async () => {
      const { contract, institution, student, sample } = await loadFixture(deployFixture);
      await expect(
        contract
          .connect(institution)
          .issueCertificate(
            student.address,
            sample.name,
            sample.course,
            sample.institution,
            sample.ipfs
          )
      )
        .to.emit(contract, "CertificateIssued")
        .withArgs(1, student.address, anyBytes32(), sample.institution);
    });

    it("unapproved caller reverts", async () => {
      const { contract, stranger, student, sample } = await loadFixture(deployFixture);
      await expect(
        contract
          .connect(stranger)
          .issueCertificate(
            student.address,
            sample.name,
            sample.course,
            sample.institution,
            sample.ipfs
          )
      ).to.be.revertedWithCustomError(contract, "NotApprovedInstitution");
    });

    it("duplicate hash reverts", async () => {
      const { contract, institution, student, sample } = await loadFixture(deployFixture);
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );
      await expect(
        contract
          .connect(institution)
          .issueCertificate(
            student.address,
            sample.name,
            sample.course,
            sample.institution,
            sample.ipfs
          )
      ).to.be.revertedWithCustomError(contract, "DuplicateCertificate");
    });
  });

  describe("Soulbound", function () {
    it("safeTransferFrom reverts", async () => {
      const { contract, institution, student, stranger, sample } = await loadFixture(
        deployFixture
      );
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );
      await expect(
        contract
          .connect(student)
          ["safeTransferFrom(address,address,uint256)"](
            student.address,
            stranger.address,
            1
          )
      ).to.be.revertedWithCustomError(contract, "SoulboundTransferBlocked");
    });
  });

  describe("Revoke", function () {
    it("issuer can revoke", async () => {
      const { contract, institution, student, sample } = await loadFixture(deployFixture);
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );
      await expect(contract.connect(institution).revokeCertificate(1))
        .to.emit(contract, "CertificateRevoked")
        .withArgs(1, institution.address);
      const c = await contract.getCertificate(1);
      expect(c.revoked).to.equal(true);
    });

    it("stranger cannot revoke", async () => {
      const { contract, institution, student, stranger, sample } = await loadFixture(
        deployFixture
      );
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );
      await expect(
        contract.connect(stranger).revokeCertificate(1)
      ).to.be.revertedWithCustomError(contract, "NotIssuerOrOwner");
    });
  });

  describe("Reissue", function () {
    it("marks old revoked, mints new with replacedBy link", async () => {
      const { contract, institution, student, sample } = await loadFixture(deployFixture);
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );

      await expect(
        contract.connect(institution).reissueCertificate(
          1,
          "John Doe", // corrected name
          "B.Tech Computer Science Engineering", // corrected course
          sample.institution,
          "ipfs://QmCorrectedHash",
          student.address
        )
      ).to.emit(contract, "CertificateReissued");

      const oldCert = await contract.getCertificate(1);
      expect(oldCert.revoked).to.equal(true);
      expect(await contract.replacedBy(1)).to.equal(2);

      const newCert = await contract.getCertificate(2);
      expect(newCert.revoked).to.equal(false);
      expect(newCert.reissuedFrom).to.equal(1);
      expect(await contract.ownerOf(2)).to.equal(student.address);
    });
  });

  describe("verifyCertificate", function () {
    it("returns valid=true for genuine certs", async () => {
      const { contract, institution, student, sample } = await loadFixture(deployFixture);
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );
      const result = await contract.verifyCertificate(
        sample.name,
        sample.course,
        sample.institution,
        sample.ipfs
      );
      expect(result.valid).to.equal(true);
      expect(result.tokenId).to.equal(1);
      expect(result.ownerAddr).to.equal(student.address);
      expect(result.revoked).to.equal(false);
    });

    it("returns valid=false for tampered input (single letter change)", async () => {
      const { contract, institution, student, sample } = await loadFixture(deployFixture);
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );
      const result = await contract.verifyCertificate(
        "Jhon Doe", // tampered
        sample.course,
        sample.institution,
        sample.ipfs
      );
      expect(result.valid).to.equal(false);
      expect(result.tokenId).to.equal(0);
    });

    it("returns valid=false for revoked certs", async () => {
      const { contract, institution, student, sample } = await loadFixture(deployFixture);
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );
      await contract.connect(institution).revokeCertificate(1);
      const result = await contract.verifyCertificate(
        sample.name,
        sample.course,
        sample.institution,
        sample.ipfs
      );
      expect(result.valid).to.equal(false);
      expect(result.revoked).to.equal(true);
    });
  });

  describe("getCertificatesByOwner", function () {
    it("returns all tokens for a student", async () => {
      const { contract, institution, student, sample } = await loadFixture(deployFixture);
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          sample.course,
          sample.institution,
          sample.ipfs
        );
      await contract
        .connect(institution)
        .issueCertificate(
          student.address,
          sample.name,
          "Another Course",
          sample.institution,
          "ipfs://QmOther"
        );
      const tokens = await contract.getCertificatesByOwner(student.address);
      expect(tokens.map((t) => Number(t))).to.deep.equal([1, 2]);
    });
  });
});

// helper matcher for any bytes32
function anyBytes32() {
  return (value: string) => typeof value === "string" && value.startsWith("0x") && value.length === 66;
}
