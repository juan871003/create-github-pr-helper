import "dotenv/config";
import fetch from "node-fetch";
import { Octokit } from "octokit";
import prompt from "prompt-sync";
import {
  getJiraTicketTitle,
  headIsJiraTicket,
  addCommentToJiraTicket,
  upsertPr,
  envVars,
  ensureEnvVar,
} from "./utils.js";

const { githubToken, jiraToken, devReviewersStr, scrumMasterReviewersStr } =
  envVars;

[githubToken, jiraToken, devReviewersStr, scrumMasterReviewersStr].forEach(
  ensureEnvVar
);

const devReviewers = JSON.parse(devReviewersStr);
const scrumMasterReviewers = JSON.parse(scrumMasterReviewersStr);

const octokit = new Octokit({
  auth: githubToken,
  request: {
    fetch: fetch,
  },
});

const main = async (params) => {
  const { head, ticketNumber } = params;

  const title = await getJiraTicketTitle({
    jiraToken,
    jiraTicket: ticketNumber,
  });

  console.log(`Title: ${title}`);

  const [prToMasterUrl, isMasterPrExisting] = await upsertPr({
    octokit,
    head,
    base: "master",
    ticketNumber,
    title,
    label: "to master",
    reviewers: devReviewers,
  });

  const [prToPreprodUrl, isPreprodPrExisting] = await upsertPr({
    octokit,
    head,
    base: "preprod",
    ticketNumber,
    title,
    label: "to preprod",
    reviewers: scrumMasterReviewers,
  });

  const bothPrsAlreadyExist = isMasterPrExisting && isPreprodPrExisting;

  if (bothPrsAlreadyExist) {
    console.log("Both PRs already exist");
  }
  console.log(
    `${isMasterPrExisting ? "Existing " : ""}PR to master: ${prToMasterUrl}`
  );
  console.log(
    `${isPreprodPrExisting ? "Existing " : ""}PR to preprod: ${prToPreprodUrl}`
  );

  if (!bothPrsAlreadyExist) {
    await addCommentToJiraTicket({
      jiraToken,
      prToMasterUrl,
      prToPreprodUrl,
      jiraTicket: ticketNumber,
      isMasterPrExisting,
      isPreprodPrExisting,
    });
  }

  console.log(
    `Jira ticket: https://${envVars.owner}.atlassian.net/browse/${ticketNumber}`
  );
  console.log("Done 🪄");
};

const getInput = prompt({ sigint: true });

const head = getInput("Enter the branch name: ");
let ticketNumber = undefined;
if (headIsJiraTicket(head)) {
  console.log("using branch name as ticket number: ");
  ticketNumber = head;
} else {
  ticketNumber = getInput("Enter the Jira ticket number: ");
}

if (!head || !ticketNumber) {
  throw new Error("Branch name and ticket number are required");
}

main({ head, ticketNumber });
