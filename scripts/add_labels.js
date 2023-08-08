const { Octokit } = require('@octokit/core');
const { context, GitHub } = require('@actions/github');

const issueTitle = context.payload.issue.title.toLowerCase();

// Define your keyword-label mappings
const keywordLabels = {
  bug: "bug",
  enhancement: "enhancement",
  documentation: "documentation"
};

const octokit = new GitHub(process.env.GITHUB_TOKEN);

async function run() {
  for (const keyword in keywordLabels) {
    if (issueTitle.includes(keyword)) {
      const label = keywordLabels[keyword];
      await octokit.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        labels: [label]
      });
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
