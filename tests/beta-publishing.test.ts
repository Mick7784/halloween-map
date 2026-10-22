import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const beta = readFileSync(".github/workflows/beta-release.yml", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");

describe("V1.0 beta publishing isolation", () => {
  it("requires manual opt-in and successful verification before publishing", () => {
    expect(ci).toContain("workflow_dispatch:");
    expect(ci).toContain("publish_beta:");
    expect(ci).toContain("default: false");
    expect(ci).toContain("inputs.publish_beta == true");
    expect(ci).toContain("needs: [verify, docker, https-media]");
    expect(ci).toContain("uses: ./.github/workflows/beta-release.yml");
  });

  it("restricts publication to the candidate branch and canonical prerelease", () => {
    expect(beta).toContain("github.ref == 'refs/heads/work/backoffice-studio-convergence'");
    expect(beta).toContain('test "$(tr -d \'\\r\\n\' < VERSION)" = "$REQUESTED_VERSION"');
    expect(beta).toContain('grep -Fqx "## $REQUESTED_VERSION" CHANGELOG.md');
    expect(beta).toContain("--prerelease");
  });

  it("publishes only the versioned image and never latest", () => {
    expect(beta).toContain("ghcr.io/mick7784/halloween-map:${{ inputs.version }}");
    expect(beta).not.toMatch(/ghcr\.io\/mick7784\/halloween-map:latest/);
    expect(ci).toContain("Prerelease version: stable publishing is disabled.");
  });
});
