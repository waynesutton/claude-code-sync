# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- `setup` command to automatically configure Claude Code hooks in `~/.claude/settings.json`
- `verify` command to check credentials and Claude Code configuration status
- `synctest` command to test connectivity and create a test session
- `hook <event>` command to handle Claude Code hook events (SessionStart, SessionEnd, UserPromptSubmit, PostToolUse, Stop)
- One-liner alternative for quick setup in documentation
- Hook events documentation section in README

### Changed

- Updated README with simplified Step 3 (setup command or one-liner)
- Added Step 4 (verify) to README Quick Start
- Added OpenSync Ecosystem section to README with links to all packages
- Updated Links section with organized package references

## [0.1.3] - 2025-01-18

### Added

- Initial public release
- `login` command for interactive credential configuration
- `logout` command to clear credentials
- `status` command to show connection status
- `config` command to display current configuration
- `set` command to update configuration values
- Environment variable support for configuration
- Automatic URL normalization (.convex.cloud to .convex.site)
- API key masking in output
