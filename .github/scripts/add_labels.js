const core = require('@actions/core');
const github = require('@actions/github');

const issueTitle = github.context.payload.issue.title.toLowerCase();

// Define your keyword-label mappings
const keywordLabels = {
  bug: "bug",
  enhancement: "enhancement",
  documentation: "documentation"
};

const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

async function run() {
  for (const keyword in keywordLabels) {
    if (issueTitle.includes(keyword)) {
      const label = keywordLabels[keyword];
      await octokit.rest.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.issue.number,
        labels: [label]
      });
    }
  }
}

run().catch(error => {
  core.setFailed(error.message);
});
