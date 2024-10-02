import nodeFetch from "node-fetch";

export const envVars = {
  githubToken: process.env.GITHUB_TOKEN,
  jiraToken: process.env.JIRA_TOKEN,
  devReviewersStr: process.env.DEV_REVIEWERS,
  scrumMasterReviewersStr: process.env.SCRUM_MASTER_REVIEWERS,
  owner: process.env.REPO_OWNER,
  repo: process.env.REPO,
  me: process.env.ME,
};

export const ensureEnvVar = (envVar) => {
  if (envVar === null || envVar === undefined) {
    throw new Error(`env var ${envVar} is required`);
  }
};

export const upsertPr = async (params) => {
  const { octokit, head, base, ticketNumber, title, label, reviewers } = params;

  const existingUrl = await isPrCreated({
    octokit,
    head,
    base,
    ticketNumber,
  });

  if (existingUrl) {
    return [existingUrl, true];
  }

  const result = await createPr({
    octokit,
    head,
    base,
    ticketNumber,
    title,
  });
  await addLabel({
    octokit,
    label,
    prNumber: result.number,
  });
  await addReviewer({
    octokit,
    prNumber: result.number,
    reviewerParam: { reviewers },
  });

  return [result.html_url, false];
};

const isPrCreated = async (params) => {
  const { octokit, head, base } = params;

  console.log(`Checking if open PR from ${head} to ${base} already exists...`);

  const { data } = await octokit.rest.pulls.list({
    owner: envVars.owner,
    repo: envVars.repo,
    head: `${envVars.owner}:${head}`,
    base,
    state: "open",
  });

  const url = data?.[0]?.html_url;

  if (url) {
    console.log(`PR already exists for ${base}: ${url}`);
  }

  return url;
};

const createPr = async (params) => {
  const { octokit, head, base, ticketNumber, title } = params;

  console.log(`Creating PR from ${head} to ${base}`);

  const { data } = await octokit.rest.pulls.create({
    owner: envVars.owner,
    repo: envVars.repo,
    head,
    base,
    title: `\`${ticketNumber}\` - ${title}`,
    body: `https://${envVars.owner}.atlassian.net/browse/${ticketNumber}`,
  });

  return data;
};

const addLabel = async (params) => {
  const { octokit, prNumber, label } = params;

  console.log(`Adding label "${label}" to PR #${prNumber}`);

  await octokit.rest.issues.addLabels({
    owner: envVars.owner,
    repo: envVars.repo,
    issue_number: prNumber,
    labels: [label],
  });
};

const addReviewer = async (params) => {
  const { octokit, prNumber, reviewerParam } = params;
  console.log(`Adding reviewer to PR #${prNumber}`);

  await octokit.rest.pulls.requestReviewers({
    owner: envVars.owner,
    repo: envVars.repo,
    pull_number: prNumber,
    ...reviewerParam,
  });
};

const getBody = (params) => {
  const {
    prToMasterUrl,
    prToPreprodUrl,
    jiraTicket,
    isMasterPrExisting,
    isPreprodPrExisting,
  } = params;
  return {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `PR to master${
                isMasterPrExisting ? " (existing)" : ""
              }: ${prToMasterUrl}`,
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: prToMasterUrl,
                    title: `GitHub PR to master for Jira ticket ${jiraTicket}`,
                  },
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `PR to preprod${
                isPreprodPrExisting ? " (existing)" : ""
              }: ${prToPreprodUrl}`,
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: prToPreprodUrl,
                    title: `GitHub PR to preprod for Jira ticket ${jiraTicket}`,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
};

export const addCommentToJiraTicket = async (params) => {
  const {
    jiraToken,
    prToMasterUrl,
    prToPreprodUrl,
    jiraTicket,
    isMasterPrExisting,
    isPreprodPrExisting,
  } = params;

  console.log(`Adding comment to Jira ticket ${jiraTicket}...`);

  const body = getBody({
    prToMasterUrl,
    prToPreprodUrl,
    jiraTicket,
    isMasterPrExisting,
    isPreprodPrExisting,
  });

  const result = await nodeFetch(
    `https://${envVars.owner}.atlassian.net/rest/api/3/issue/${jiraTicket}/comment`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${envVars.me}:${jiraToken}`
        ).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  // console.log(result);

  console.log("Comment added");
};

export const headIsJiraTicket = (head) => {
  const startsWithGc = head.startsWith("GC-");

  if (!startsWithGc) {
    return false;
  }

  const tokens = head.split("-");
  if (tokens.length !== 2) {
    return false;
  }
  const ticketNumber = tokens[1];
  const isAllDigits = /^\d+$/.test(ticketNumber);
  return isAllDigits;
};

export const getJiraTicketTitle = async (params) => {
  const { jiraToken, jiraTicket } = params;

  const result = await nodeFetch(
    `https://${envVars.owner}.atlassian.net/rest/api/3/issue/${jiraTicket}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${envVars.me}:${jiraToken}`
        ).toString("base64")}`,
        Accept: "application/json",
      },
    }
  );

  const json = await result?.json?.();

  if (!json || json.errorMessages?.length) {
    throw new Error(`Error fetching Jira ticket ${jiraTicket}: ${result}`);
  }

  return json?.fields?.summary;
};
