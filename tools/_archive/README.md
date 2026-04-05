# Archived one-off tools

This folder contains one-time maintenance scripts that were used during refactors/cleanup.
They are kept for reference but are not part of the normal runtime.

## tab05 account consolidation cleanup
- `patch_tab05_account_legacy_guard.py`: inserted an early-return guard into legacy per-page tab05 blocks.
- `remove_tab05_account_legacy_blocks.py`: removed the legacy tab05 blocks after consolidation.
