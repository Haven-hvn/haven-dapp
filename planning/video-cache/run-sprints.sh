#!/bin/bash
# Haven DApp — Video Cache Sprint Orchestration Script
# =====================================================
# This script orchestrates the sequential execution of all sprint tasks
# using kimi CLI in yolo mode. Each task is a markdown file containing
# full requirements, code examples, and acceptance criteria.
#
# Usage: ./run-sprints.sh [OPTIONS] [start_from_task]
#
# Options:
#   --dry-run, -d     Preview tasks without running kimi
#   --list, -l        List all tasks
#   --help, -h        Show this help message
#
# Arguments:
#   start_from_task   Optional. Start from a specific task number (1-25)
#
# Progress is tracked in SPRINT_PROGRESS.md

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROGRESS_FILE="$SCRIPT_DIR/SPRINT_PROGRESS.md"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Global variables
START_TASK_ARG=""

# Task definitions in sequential order
# Format: "sprint_folder|task_file|task_description"
declare -a TASKS=(
    # Sprint 1 — Service Worker + Cache API Foundation
    "sprint-1|01-service-worker-setup.md|Service Worker setup — registration, fetch interception, Range request handling"
    "sprint-1|02-cache-api-wrapper.md|Cache API wrapper — putVideo, getVideo, hasVideo, deleteVideo, listCachedVideos"
    "sprint-1|03-use-video-cache-hook.md|useVideoCache React hook — cache-first loading, decryption fallback"
    "sprint-1|04-next-config-sw-headers.md|Next.js config — Service-Worker-Allowed header, SW serving config"
    "sprint-1|05-sprint-1-integration-test.md|Sprint 1 integration tests — manual test plan + Playwright automated tests"
    # Sprint 2 — Decryption Pipeline Optimization
    "sprint-2|01-opfs-staging.md|OPFS staging — writeToStaging, readFromStaging, deleteStaging, clearAllStaging"
    "sprint-2|02-decryption-to-cache-pipeline.md|Decryption-to-cache pipeline — aesDecryptToCache, output mode selection"
    "sprint-2|03-memory-pressure-detection.md|Memory pressure detection — getMemoryInfo, getDecryptionStrategy"
    "sprint-2|04-eager-gc-cleanup.md|Eager GC cleanup — BufferLifecycleManager, ArrayBuffer detach via MessageChannel"
    # Sprint 3 — Session & Key Caching
    "sprint-3|01-lit-session-cache.md|Lit session cache — getCachedAuthContext, setCachedAuthContext, 5min safety margin"
    "sprint-3|02-aes-key-cache.md|AES key cache — getCachedKey, setCachedKey, secureCopy, secureClear"
    "sprint-3|03-cache-ttl-expiration.md|Cache TTL & expiration — isExpired, runCleanupSweep, LRU tracking"
    "sprint-3|04-wallet-disconnect-cleanup.md|Wallet disconnect cleanup — onWalletDisconnect, onAccountChange, wagmi integration"
    # Sprint 4 — VideoPlayer Refactor & Cache-First Architecture
    "sprint-4|01-videoplayer-refactor.md|VideoPlayer refactor — replace useIpfsFetch+useVideoDecryption with useVideoCache"
    "sprint-4|02-cache-indicator-component.md|Cache indicator component — CacheIndicator badge, CacheAwareProgress"
    "sprint-4|03-library-cache-badges.md|Library cache badges — useCacheStatus hook, green cloud badge on video cards"
    "sprint-4|04-preload-prefetch.md|Preload & prefetch — prefetchVideo queue, useHoverPrefetch, connection-aware"
    # Sprint 5 — Cache Management UI & Polish
    "sprint-5|01-cache-management-settings.md|Cache management settings — CacheManagement component, Zustand cacheSettingsStore"
    "sprint-5|02-storage-persistence.md|Storage persistence — requestPersistentStorage, isPersisted, getStorageDetails"
    "sprint-5|03-error-recovery.md|Error recovery — graceful degradation, cache integrity verification, error logging"
    "sprint-5|04-browser-compatibility.md|Browser compatibility — detectCapabilities, buildCacheConfig, CapabilitiesProvider"
    # Sprint 6 — Testing & Documentation
    "sprint-6|01-unit-tests.md|Unit tests — test specs for all 7 new lib modules"
    "sprint-6|02-e2e-tests.md|E2E tests — Playwright suites for SW lifecycle, cache-first playback, management"
    "sprint-6|03-performance-benchmarks.md|Performance benchmarks — latency, memory, pipeline, cache operation benchmarks"
    "sprint-6|04-architecture-documentation.md|Architecture documentation — overview, API reference, developer guide, troubleshooting"
)

TOTAL_TASKS=${#TASKS[@]}

# ─── Output helpers ───────────────────────────────────────────────────

print_header() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# ─── Progress tracking ────────────────────────────────────────────────

init_progress() {
    if [[ ! -f "$PROGRESS_FILE" ]]; then
        local start_time
        start_time=$(date '+%Y-%m-%d %H:%M:%S')
        cat > "$PROGRESS_FILE" << EOF
# Haven DApp — Video Cache Sprint Progress

This file tracks the progress of all sprint tasks.

## Overall Progress

- **Started:** $start_time
- **Current Task:** 0 / $TOTAL_TASKS
- **Completed:** 0 / $TOTAL_TASKS
- **Status:** 🟡 Not Started

## Task Status

| # | Sprint | Task File | Description | Status | Completed At |
|---|--------|-----------|-------------|--------|--------------|
EOF
        print_info "Created new progress file: $PROGRESS_FILE"
    fi
}

update_progress() {
    local task_num=$1
    local status=$2
    local sprint=$3
    local task_file=$4
    local description=$5
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Update overall progress counts
    local completed_count
    completed_count=$(grep -c "✅ Complete" "$PROGRESS_FILE" 2>/dev/null || echo "0")

    if [[ "$status" == "✅ Complete" ]]; then
        completed_count=$((completed_count + 1))
    fi

    sed -i '' "s/- \*\*Current Task:\*\* .*/- **Current Task:** $task_num \/ $TOTAL_TASKS/" "$PROGRESS_FILE"
    sed -i '' "s/- \*\*Completed:\*\* .*/- **Completed:** $completed_count \/ $TOTAL_TASKS/" "$PROGRESS_FILE"

    if [[ $completed_count -eq $TOTAL_TASKS ]]; then
        sed -i '' "s/- \*\*Status:\*\* .*/- **Status:** 🟢 Complete/" "$PROGRESS_FILE"
    elif [[ $completed_count -gt 0 ]]; then
        sed -i '' "s/- \*\*Status:\*\* .*/- **Status:** 🟡 In Progress/" "$PROGRESS_FILE"
    fi

    # Truncate description for the table
    local short_desc="${description:0:60}"
    local row="| $task_num | $sprint | $task_file | $short_desc | $status | $timestamp |"

    if grep -q "| $task_num |" "$PROGRESS_FILE"; then
        # Update existing row — use a temp file approach for safety
        local tmp_file
        tmp_file=$(mktemp)
        awk -v num="$task_num" -v row="$row" '
            /^\| / && $2 == num { print row; next }
            { print }
        ' "$PROGRESS_FILE" > "$tmp_file"
        mv "$tmp_file" "$PROGRESS_FILE"
    else
        echo "$row" >> "$PROGRESS_FILE"
    fi
}

mark_in_progress() {
    update_progress "$1" "🟡 In Progress" "$2" "$3" "$4"
}

mark_complete() {
    update_progress "$1" "✅ Complete" "$2" "$3" "$4"
}

mark_failed() {
    update_progress "$1" "❌ Failed" "$2" "$3" "$4"
}

# ─── Prerequisite checks ──────────────────────────────────────────────

check_kimi() {
    if ! command -v kimi &> /dev/null; then
        print_error "kimi is not installed or not in PATH"
        echo "Please install kimi CLI first"
        exit 1
    fi
    print_success "kimi found: $(which kimi)"
}

# ─── Run a single task ────────────────────────────────────────────────

run_task() {
    local task_num=$1
    local sprint=$2
    local task_file=$3
    local description=$4

    local task_path="$SCRIPT_DIR/$sprint/$task_file"

    print_header "Task $task_num of $TOTAL_TASKS: [$sprint] $description"
    print_info "Task File: $task_path"

    # Verify task file exists
    if [[ ! -f "$task_path" ]]; then
        print_error "Task file not found: $task_path"
        mark_failed "$task_num" "$sprint" "$task_file" "$description"
        return 1
    fi

    # Mark as in progress
    mark_in_progress "$task_num" "$sprint" "$task_file" "$description"

    echo ""
    echo -e "${YELLOW}-----------------------------------------------------------${NC}"
    echo -e "${YELLOW}  Task $task_num/$TOTAL_TASKS: [$sprint] $task_file${NC}"
    echo -e "${YELLOW}  $description${NC}"
    echo -e "${YELLOW}-----------------------------------------------------------${NC}"
    echo ""

    # Show first 20 lines of the task file as preview
    head -n 20 "$task_path"
    echo ""
    echo -e "${YELLOW}  ... (see full task file for details)${NC}"
    echo -e "${YELLOW}-----------------------------------------------------------${NC}"
    echo ""

    # Run kimi in yolo mode with the task file as prompt
    print_info "Starting kimi --yolo with task prompt..."
    echo ""

    local exit_code=0
    (cd "$PROJECT_DIR" && kimi --yolo --prompt "$task_path") || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        echo ""
        print_success "Task $task_num completed successfully!"
        mark_complete "$task_num" "$sprint" "$task_file" "$description"
        return 0
    else
        echo ""
        print_error "Task $task_num failed or was interrupted (exit code: $exit_code)"
        mark_failed "$task_num" "$sprint" "$task_file" "$description"
        return 1
    fi
}

# ─── Main execution ───────────────────────────────────────────────────

main() {
    print_header "Haven DApp — Video Cache Sprint Orchestrator"
    echo ""
    print_info "Total Tasks: $TOTAL_TASKS"
    print_info "Progress File: $PROGRESS_FILE"
    print_info "Project Dir: $PROJECT_DIR"
    echo ""

    # Check prerequisites
    check_kimi

    # Initialize progress tracking
    init_progress

    # Determine starting task
    local start_task=1
    local task_arg="${START_TASK_ARG:-$1}"

    if [[ -n "$task_arg" ]]; then
        if [[ "$task_arg" =~ ^[0-9]+$ ]] && [[ "$task_arg" -ge 1 ]] && [[ "$task_arg" -le $TOTAL_TASKS ]]; then
            start_task=$task_arg
            print_info "Starting from task $start_task"
        else
            print_error "Invalid task number: $task_arg (must be 1-$TOTAL_TASKS)"
            exit 1
        fi
    fi

    echo ""

    # Process tasks sequentially
    local current_task=$start_task

    while [[ $current_task -le $TOTAL_TASKS ]]; do
        # Parse task info
        IFS='|' read -r sprint task_file description <<< "${TASKS[$((current_task-1))]}"

        echo ""
        print_header "Starting Task $current_task of $TOTAL_TASKS"

        # Run the task
        if run_task "$current_task" "$sprint" "$task_file" "$description"; then
            print_success "Task $current_task completed — moving to next task"
        else
            print_error "Task $current_task failed"
            echo ""
            print_warning "Task failed — continuing to next task in 5 seconds..."
            print_info "Press Ctrl+C to stop execution"
            sleep 5
        fi

        ((current_task++))

        # Brief pause between tasks (except after the last one)
        if [[ $current_task -le $TOTAL_TASKS ]]; then
            echo ""
            echo -e "${CYAN}========================================${NC}"
            echo -e "${CYAN}  Task complete. Preparing next...${NC}"
            echo -e "${CYAN}========================================${NC}"
            echo ""
            print_info "Auto-continuing to task $current_task in 3 seconds..."
            print_info "Press Ctrl+C to stop execution"
            sleep 3
        fi
    done

    # All tasks complete
    echo ""
    print_header "ALL TASKS COMPLETE! 🎉"
    print_success "All $TOTAL_TASKS tasks have been executed"
    print_info "Progress tracked in: $PROGRESS_FILE"

    # Update final status
    sed -i '' "s/- \*\*Status:\*\* .*/- **Status:** 🟢 Complete/" "$PROGRESS_FILE"
}

# ─── Help ──────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
Haven DApp — Video Cache Sprint Orchestration Script
======================================================

This script orchestrates the sequential execution of all 25 video cache
implementation tasks using kimi CLI in yolo mode. Tasks are organized
into 6 sprints and executed in dependency order.

USAGE:
    ./run-sprints.sh [OPTIONS] [START_TASK]

OPTIONS:
    --dry-run, -d     Preview all tasks without running kimi
    --list, -l        List all tasks with their status
    --help, -h        Show this help message

ARGUMENTS:
    START_TASK        Optional. Start from a specific task number (1-25)

EXAMPLES:
    ./run-sprints.sh                  # Run all tasks from the beginning
    ./run-sprints.sh 6                # Start from task 6 (Sprint 2)
    ./run-sprints.sh --dry-run        # Preview all tasks
    ./run-sprints.sh --list           # List all tasks with status

PROGRESS TRACKING:
    Progress is saved to planning/video-cache/SPRINT_PROGRESS.md

SPRINT OVERVIEW:
    Sprint 1 — Service Worker + Cache API Foundation (Tasks 1-5)
      Task  1: Service Worker setup — registration, fetch interception, Range requests
      Task  2: Cache API wrapper — putVideo, getVideo, hasVideo, deleteVideo
      Task  3: useVideoCache React hook — cache-first loading
      Task  4: Next.js config — Service-Worker-Allowed header
      Task  5: Sprint 1 integration tests

    Sprint 2 — Decryption Pipeline Optimization (Tasks 6-9)
      Task  6: OPFS staging — disk-based encrypted file staging
      Task  7: Decryption-to-cache pipeline — aesDecryptToCache
      Task  8: Memory pressure detection — strategy selection
      Task  9: Eager GC cleanup — BufferLifecycleManager

    Sprint 3 — Session & Key Caching (Tasks 10-13)
      Task 10: Lit session cache — avoid wallet popup on replay
      Task 11: AES key cache — secure in-memory key storage
      Task 12: Cache TTL & expiration — cleanup sweeps, LRU
      Task 13: Wallet disconnect cleanup — security wipe

    Sprint 4 — VideoPlayer Refactor & Cache-First Architecture (Tasks 14-17)
      Task 14: VideoPlayer refactor — single useVideoCache hook
      Task 15: Cache indicator component — badges & progress
      Task 16: Library cache badges — green cloud on cached cards
      Task 17: Preload & prefetch — hover prefetch, queue

    Sprint 5 — Cache Management UI & Polish (Tasks 18-21)
      Task 18: Cache management settings page
      Task 19: Storage persistence — navigator.storage.persist()
      Task 20: Error recovery — graceful degradation
      Task 21: Browser compatibility — feature detection

    Sprint 6 — Testing & Documentation (Tasks 22-25)
      Task 22: Unit tests for all new modules
      Task 23: E2E tests — Playwright suites
      Task 24: Performance benchmarks
      Task 25: Architecture documentation
EOF
}

# ─── List all tasks ────────────────────────────────────────────────────

list_tasks() {
    echo ""
    print_header "Haven DApp — All Video Cache Tasks"

    printf "\n%-5s %-12s %-40s %-15s\n" "Task" "Sprint" "Task File" "Status"
    echo "──────────────────────────────────────────────────────────────────────────────────"

    local i=1
    for task_info in "${TASKS[@]}"; do
        IFS='|' read -r sprint task_file description <<< "$task_info"
        local task_path="$SCRIPT_DIR/$sprint/$task_file"

        # Determine status from progress file
        local status="⏳ Pending"
        if [[ -f "$PROGRESS_FILE" ]] && grep -q "| $i |" "$PROGRESS_FILE"; then
            if grep "| $i |" "$PROGRESS_FILE" | grep -q "✅"; then
                status="✅ Complete"
            elif grep "| $i |" "$PROGRESS_FILE" | grep -q "🟡"; then
                status="🟡 In Progress"
            elif grep "| $i |" "$PROGRESS_FILE" | grep -q "❌"; then
                status="❌ Failed"
            fi
        fi

        # Check if task file exists
        if [[ ! -f "$task_path" ]]; then
            status="📁 Missing"
        fi

        printf "%-5s %-12s %-40s %-15s\n" "$i" "$sprint" "$task_file" "$status"
        ((i++))
    done

    echo ""
    print_info "Run ./run-sprints.sh to execute all tasks sequentially"
    print_info "Run ./run-sprints.sh <number> to start from a specific task"
}

# ─── Dry run ───────────────────────────────────────────────────────────

dry_run() {
    echo ""
    print_header "DRY RUN — Task Preview"
    print_info "The following tasks would be executed in order:"
    echo ""

    local i=1
    local current_sprint=""
    for task_info in "${TASKS[@]}"; do
        IFS='|' read -r sprint task_file description <<< "$task_info"
        local task_path="$SCRIPT_DIR/$sprint/$task_file"

        # Print sprint header when sprint changes
        if [[ "$sprint" != "$current_sprint" ]]; then
            current_sprint="$sprint"
            echo ""
            echo -e "${CYAN}── $sprint ──────────────────────────────────────${NC}"
        fi

        echo -e "  ${CYAN}Task $i:${NC} $description"
        echo "    File: $task_path"

        if [[ -f "$task_path" ]]; then
            echo -e "    ${GREEN}✓ File exists${NC}"
            echo "    Command: kimi --yolo --prompt $task_path"
        else
            echo -e "    ${RED}✗ File not found!${NC}"
        fi

        echo ""
        ((i++))
    done

    print_success "Dry run complete. $TOTAL_TASKS tasks would be executed."
}

# ─── Argument parsing ─────────────────────────────────────────────────

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                show_help
                exit 0
                ;;
            --list|-l)
                init_progress 2>/dev/null || true
                list_tasks
                exit 0
                ;;
            --dry-run|-d)
                dry_run
                exit 0
                ;;
            [0-9]*)
                START_TASK_ARG=$1
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# ─── Interrupt handler ────────────────────────────────────────────────

trap 'echo ""; print_warning "Interrupted by user. Progress saved to $PROGRESS_FILE"; exit 0' INT TERM

# ─── Entry point ──────────────────────────────────────────────────────

parse_args "$@"
main ${START_TASK_ARG:-}