import "dotenv/config";
import fetch from "node-fetch";
import { Octokit } from "octokit";
import prompt from "prompt-sync";
import {
  getJiraTicketTitle,
  isCorrectJiraTicket,
  addCommentToJiraTicket,
  upsertPr,
  envVars,
  ensureEnvVar,
  getBranchNames,
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
  const { ticketNumber } = params;

  const { masterBranchName, preprodBranchName } = await getBranchNames({
    octokit,
    ticketNumber,
  });

  const title = await getJiraTicketTitle({
    jiraToken,
    jiraTicket: ticketNumber,
  });

  console.log(`Title: ${title}`);

  const [prToMasterUrl, isMasterPrExisting] = await upsertPr({
    octokit,
    head: masterBranchName,
    base: "master",
    ticketNumber,
    title,
    label: "to master",
    reviewers: devReviewers,
  });

  const [prToPreprodUrl, isPreprodPrExisting] = await upsertPr({
    octokit,
    head: preprodBranchName,
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

let ticketNumber = getInput("Enter jira ticket number: ");
if (!ticketNumber.startsWith("GC-")) {
  ticketNumber = `GC-${ticketNumber}`;
}
if (!isCorrectJiraTicket(ticketNumber)) {
  throw new Error(
    `Invalid Jira ticket format: ${ticketNumber}. It should start with "GC-".`
  );
}

main({ ticketNumber });
