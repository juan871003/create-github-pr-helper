# What is this used for?

In our current project, we are required to create two pull requests (PRs) for each Jira ticket: one targeting the `master` branch and another targeting the `preprod` branch. This approach allows us to selectively deploy changes to production while enabling testers to validate all changes on the `master` branch.

Manually creating these PRs, each with a link to the corresponding Jira ticket, assigning different reviewers, setting various flags, and adding comments to the Jira ticket with links to the PRs is a time-consuming process.

This script automates the entire workflow. By simply providing a Jira ticket number, the script will handle the creation of the PRs and the addition of comments to the Jira ticket, streamlining the process significantly.
