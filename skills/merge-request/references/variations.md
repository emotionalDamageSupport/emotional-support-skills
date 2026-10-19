# Variations

Less common merge-request requests. Everything not mentioned here follows `SKILL.md` as usual.

## Update an existing MR ("обнови описание мр")

Rebuild the description from the full current diff (`git diff <target>...HEAD`), not just the new commits, and update the MR in place: the GitLab MCP server's `update_merge_request`, `glab mr update`, or `gh pr edit`. Keep the title unless the change's scope moved; if it did, run `check-title.sh` again. Save it directly and reply with the URL, as for a new MR.

## Several repos at once ("в гейт и во фронт")

One MR per repo, created in dependency order (the service whose release the others need goes first). Each MR names the others in `## Зависимость`, with links once they exist.

## Same change into another branch ("и в main тоже")

Create a new branch from that target and cherry-pick onto it. If the original MR was already squash-merged, its commits no longer exist on the target: cherry-pick the squash commit instead. Then run the normal flow with the new target.
