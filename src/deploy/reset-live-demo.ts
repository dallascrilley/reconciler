import { pathToFileURL } from "node:url";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ResetLiveDemoOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  sleep?: (milliseconds: number) => Promise<void>;
  deploymentPollLimit?: number;
  readinessPollLimit?: number;
};

type DeploymentResponse = {
  deployments?: Array<{ deployment_uuid?: string }>;
};

type DeploymentStatus = {
  status?: string;
};

type SummaryResponse = {
  appliedBillingActionCount?: number;
  pendingProposalCount?: number;
};

type DashboardResponse = {
  eval?: {
    passed?: number;
    total?: number;
    passRate?: number;
  };
};

const failedDeploymentStatuses = new Set([
  "cancelled",
  "cancelled-by-user",
  "failed",
  "error",
]);

function requireEnvironmentValue(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function readJson<T>(response: Response, description: string): Promise<T> {
  if (!response.ok) throw new Error(`${description} failed with status ${response.status}`);
  return response.json() as Promise<T>;
}

export async function resetLiveDemo(options: ResetLiveDemoOptions = {}): Promise<{
  deploymentUuid: string;
  evalPassed: number;
  evalTotal: number;
}> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deploymentPollLimit = options.deploymentPollLimit ?? 120;
  const readinessPollLimit = options.readinessPollLimit ?? 30;
  const apiToken = requireEnvironmentValue(env, "COOLIFY_API_TOKEN");
  const applicationUuid = requireEnvironmentValue(env, "COOLIFY_APPLICATION_UUID");
  const publicUrl = requireEnvironmentValue(env, "RECONCILER_PUBLIC_URL").replace(/\/+$/, "");
  const apiUrl = (env.COOLIFY_API_URL?.trim() || "https://app.coolify.io").replace(/\/+$/, "");
  const authorization = `Bearer ${apiToken}`;

  const deployment = await readJson<DeploymentResponse>(
    await fetchImpl(`${apiUrl}/api/v1/deploy`, {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({ force: true, uuid: applicationUuid }),
    }),
    "Coolify deployment request",
  );
  const deploymentUuid = deployment.deployments?.[0]?.deployment_uuid;
  if (!deploymentUuid) throw new Error("Coolify deployment response did not include a deployment UUID");

  let deploymentFinished = false;
  for (let attempt = 0; attempt < deploymentPollLimit; attempt += 1) {
    const deploymentStatus = await readJson<DeploymentStatus>(
      await fetchImpl(`${apiUrl}/api/v1/deployments/${deploymentUuid}`, {
        headers: { authorization },
      }),
      "Coolify deployment status",
    );
    const status = deploymentStatus.status?.toLowerCase();
    if (status === "finished") {
      deploymentFinished = true;
      break;
    }
    if (status && failedDeploymentStatuses.has(status)) {
      throw new Error(`Coolify deployment ${deploymentUuid} ended with status ${status}`);
    }
    await sleep(5_000);
  }
  if (!deploymentFinished) throw new Error(`Coolify deployment ${deploymentUuid} did not finish before timeout`);

  let readinessError: Error | undefined;
  for (let attempt = 0; attempt < readinessPollLimit; attempt += 1) {
    try {
      const pageResponse = await fetchImpl(`${publicUrl}/`);
      if (!pageResponse.ok) throw new Error(`public dashboard returned status ${pageResponse.status}`);
      if (!(await pageResponse.text()).includes("Proposal eval gate")) {
        throw new Error("public dashboard did not render the proposal eval gate");
      }

      const summary = await readJson<SummaryResponse>(
        await fetchImpl(`${publicUrl}/api/summary`),
        "public summary",
      );
      if (summary.appliedBillingActionCount !== 0 || summary.pendingProposalCount !== 5) {
        throw new Error("public summary did not return freshly seeded review state");
      }

      const dashboard = await readJson<DashboardResponse>(
        await fetchImpl(`${publicUrl}/api/dashboard`),
        "public dashboard data",
      );
      const evaluation = dashboard.eval;
      if (evaluation?.passed !== 5 || evaluation.total !== 5 || evaluation.passRate !== 1) {
        throw new Error("public dashboard eval gate is not 5/5");
      }

      return {
        deploymentUuid,
        evalPassed: evaluation.passed,
        evalTotal: evaluation.total,
      };
    } catch (error) {
      readinessError = error instanceof Error ? error : new Error(String(error));
      await sleep(2_000);
    }
  }

  throw new Error(`Reconciler did not become ready after deployment: ${readinessError?.message ?? "unknown error"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resetLiveDemo()
    .then((result) => {
      console.log(
        `Reset live Reconciler demo via deployment ${result.deploymentUuid}; eval gate ${result.evalPassed}/${result.evalTotal}.`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
