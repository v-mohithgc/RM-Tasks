const azdev = require('azure-devops-node-api');

const getIssuesQuery = `
query ($owner: String!, $projectNumber: Int!, $nextPage: String) {
  organization(login: $owner) {
    projectV2(number: $projectNumber) {
      items(first: 100, after: $nextPage) {
        nodes {
          content {
            ... on Issue {
              number
              bodyHTML
              title
              url
              repository {
                name
                owner {
                  login
                }
              }
            }
          }
          fieldValues(first: 100) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
            }
          }
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
}`;

async function cloneIssuesToAdo(github, context, options) {
    if (!github) {
        throw new Error('GitHub rest client was not specified');
    }
    if (!context) {
        throw new Error('Context was not specified');
    }
    if (!options) {
        throw new Error('Options was not specified');
    }
    
    const issuesQueryVars = {
        "owner": options.gitHubOwner ?? context.repo.owner,
        "projectNumber": options.gitHubProjectNumber
    };
    
    
    console.log(`Looking for issues in columns ${options.gitHubProjectColumns.join(', ')}`);

    const issues = [];
    let issuesQueryResponse = null;
    do {
        const updatedIssuesQueryVars = {
            ...issuesQueryVars, 
            nextPage: issuesQueryResponse?.organization.projectV2.items.pageInfo.hasNextPage ? issuesQueryResponse.organization.projectV2.items.pageInfo.endCursor : ''
        };
        issuesQueryResponse = await github.graphql(getIssuesQuery, updatedIssuesQueryVars);
        for (const issue of issuesQueryResponse.organization.projectV2.items.nodes) {
            if (issue.fieldValues.nodes.filter(e => options.gitHubProjectColumns.indexOf(e.name) > -1).length > 0) {
                issues.push({
                    number: issue.content.number,
                    title: issue.content.title,
                    body: issue.content.bodyHTML,
                    url: issue.content.url,
                    repo: issue.content.repository.name,
                    owner: issue.content.repository.owner.login
                });
            }
        }
    } while (issuesQueryResponse?.organization.projectV2.items.pageInfo.hasNextPage)

    console.log(`Found '${issues.length}' issue(s)`);

    if (issues.length === 0) {
        return;
    }

    console.log('Connect to ADO');
    
    const authHandler = azdev.getPersonalAccessTokenHandler(options.adoPAT);
    const connection = new azdev.WebApi(options.orgUrl, authHandler);
    const workItemClient = await connection.getWorkItemTrackingApi();

    for (const issue of issues) {
        console.log(`Processing issue '${issue.number}'`);
        
        const descriptionPrefix = `[${issue.owner}/${issue.repo}] Issue ${issue.number} - `;
        const searchClonedWorkItemQuery = `
            SELECT
                [System.Id]
            FROM workitems
            WHERE
                [System.TeamProject] = '${options.project}'
                AND [System.Title] CONTAINS '${descriptionPrefix}'`;
                
        let searchClonedWorkItemResult = null
        
        try {
            searchClonedWorkItemResult = await workItemClient.queryByWiql({
                query: searchClonedWorkItemQuery
            });
        } catch (ex) {
            console.log(`::warning::Issue has occurred during checking if issue was cloned already: ${ex}, we will try to clone this issue next time`);
            continue;
        }
        
        if (searchClonedWorkItemResult.workItems.length > 0) {
            console.log(`Found existing work items related to the issue: ${searchClonedWorkItemResult.workItems.map(e => e.id).join(', ')}`);
            continue;
        } 

        const patchDoc = [
            {
                "op": "add",
                "path": "/fields/System.Title",
                "from": null,
                "value": `${descriptionPrefix}${issue.title}`
            },
            {
                "op": "add",
                "path": "/fields/System.Description",
                "from": null,
                "value": `<div>Link to the issue: <a href="${issue.url}">${issue.url}</a></div>${issue.body}`
            },
            {
                "op": "add",
                "path": "/fields/System.IterationPath",
                "from": null,
                "value": options.iteration
            },
            {
                "op": "add",
                "path": "/fields/System.AreaPath",
                "from": null,
                "value": options.areaPath
            },
        ]

        let createdWorkItem = null;

        try {
            createdWorkItem = await workItemClient.createWorkItem(
                null,
                patchDoc,
                options.project,
                options.workItemType
            );
        } catch (ex) {
            console.log(`::error::Issue has occurred during creation of work item: ${ex}`);
        }

        if (createdWorkItem?.id) {
            console.log(`Created work item '${createdWorkItem.id}' for issue '${issue.number}'`);
        } else {
            console.log(`::warning::Work item was not created for issue '${issue.number}'. We will attempt to create work item next time`);
        }
    }
}

module.exports = {
    cloneIssuesToAdo
}
