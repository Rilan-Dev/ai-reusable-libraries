# Next action

1. Finish publishing the source-extraction-agent package to the feature branch.
2. Retrieve resulting commit and inspect branch files to confirm intended content is present.
3. Run available schema/link/structure checks in a real checkout; record actual results and fix defects without touching upstream source.
4. Integrate with parent project-control conventions only after inspecting existing files; do not replace them blindly.
5. Implement a separate executable verifier and fixture-based tests in a follow-up task if not already present.
6. Start target-specific onboarding only after this agent package is accessible and checkpointed.
