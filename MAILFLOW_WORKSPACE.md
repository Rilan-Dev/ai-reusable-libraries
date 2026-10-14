# MailFlow Extraction Workspace

MailFlow-specific extraction records are maintained in the MailFlow repository, not duplicated here:

- Workspace: https://github.com/Rilan-Dev/mailflow/tree/main/extraction/
- Vendored framework in MailFlow: https://github.com/Rilan-Dev/mailflow/tree/main/source-extraction-agent/
- Migration PR: https://github.com/Rilan-Dev/mailflow/pull/2

This repository remains the canonical home for the reusable source-extraction framework and the cross-source catalog/program controls. The MailFlow repository contains its own versioned copy of the framework so extraction sessions can work self-contained.

MailFlow's discovery pin is not authorization to copy application source. The source repository's project-control records remain authoritative for MailFlow-specific status. The global watcher is disabled for MailFlow until external-repository pin support is implemented.
