#!/bin/bash
# Haven DApp — Local Cache Sprint Orchestration Script
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
#   start_from_task   Optional. Start from a specific task number (1-18)
#
# Progress is tracked in SPRINT_PROGRESS.md

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROGRESS_FILE="$SCRIPT_DIR/SPRINT_PROGRESS.md"
README_FILE="$SCRIPT_DIR/README.md"

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
    "sprint-1|01-define-cache-types.md|Define cache TypeScript types & schema (CachedVideo, CacheDBSchema, CacheConfig)"
    "sprint-1|02-setup-indexeddb-service.md|Set up IndexedDB service layer with idb, CRUD operations, connection pooling"
    "sprint-1|03-video-to-cached-video-transform.md|Video ↔ CachedVideo transform utilities, sync hashing, serialization"
    "sprint-1|04-cache-service-layer.md|Cache service layer — syncWithArkiv, getMergedVideos, eviction"
    "sprint-1|05-unit-tests-foundation.md|Unit tests for foundation layer (db, transforms, cacheService)"
    "sprint-2|01-integrate-cache-into-video-service.md|Integrate cache into videoService — write-through, fallback, merged results"
    "sprint-2|02-update-react-query-hooks.md|Update React Query hooks for cache-aware fetching, useCachedVideos"
    "sprint-2|03-cache-state-store.md|Cache state Zustand store — sync status, preferences, selectors"
    "sprint-2|04-cache-initialization-lifecycle.md|Cache initialization & lifecycle — CacheInitProvider, wallet events"
    "sprint-2|05-integration-tests.md|Integration tests for cache data flow — service, hooks, store"
    "sprint-3|01-background-sync-engine.md|Background sync engine — periodic sync, network-aware, page visibility"
    "sprint-3|02-expiration-tracking.md|Entity expiration tracking & block monitoring — proactive detection"
    "sprint-3|03-schema-migration-strategy.md|Schema migration strategy — versioned migrations, lazy upgrades"
    "sprint-3|04-error-recovery-resilience.md|Error recovery & cache resilience — quota, corruption, eviction handling"
    "sprint-4|01-expired-video-ui-indicators.md|Expired video UI indicators — badges, banners, filters"
    "sprint-4|02-cache-management-settings.md|Cache management settings page — stats, sync controls, clear cache"
    "sprint-4|03-export-import-cache.md|Export & import cache data — JSON backup/restore with checksums"
    "sprint-4|04-e2e-tests-documentation.md|End-to-end tests & developer documentation"
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
# Haven DApp — Local Cache Sprint Progress

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

    # Create a focused prompt that tells the AI exactly what to do
    local focused_prompt
    focused_prompt=$(cat << EOF
You are working on the Haven DApp local cache implementation. 

YOUR CURRENT TASK: $description
SPRINT: $sprint
TASK FILE: $task_file

INSTRUCTIONS:
1. Read the task requirements below
2. Implement ONLY what is requested in this specific task
3. Do not work on other parts of the project
4. Follow the code examples and patterns shown in the task
5. Make sure your implementation matches the acceptance criteria
6. Report back with what files you created/modified

TASK REQUIREMENTS:
$(cat "$task_path")
EOF
)

    # Run kimi with the focused prompt
    print_info "Starting kimi with focused task instructions..."
    echo ""

    local exit_code=0
    (cd "$PROJECT_DIR" && echo "$focused_prompt" | kimi --yolo) || exit_code=$?

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
    print_header "Haven DApp — Local Cache Sprint Orchestrator"
    echo ""
    print_info "Total Tasks: $TOTAL_TASKS"
    print_info "Progress File: $PROGRESS_FILE"
    print_info "Project Dir: $PROJECT_DIR"
    print_info "README File: $README_FILE"
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
Haven DApp — Local Cache Sprint Orchestration Script
======================================================

This script orchestrates the sequential execution of all 18 cache
implementation tasks using kimi CLI in yolo mode. Tasks are organized
into 4 sprints and executed in dependency order.

USAGE:
    ./run-sprints.sh [OPTIONS] [START_TASK]

OPTIONS:
    --dry-run, -d     Preview all tasks without running kimi
    --list, -l        List all tasks with their status
    --help, -h        Show this help message

ARGUMENTS:
    START_TASK        Optional. Start from a specific task number (1-18)

EXAMPLES:
    ./run-sprints.sh                  # Run all tasks from the beginning
    ./run-sprints.sh 6                # Start from task 6 (Sprint 2)
    ./run-sprints.sh --dry-run        # Preview all tasks
    ./run-sprints.sh --list           # List all tasks with status

PROGRESS TRACKING:
    Progress is saved to planning/SPRINT_PROGRESS.md

SPRINT OVERVIEW:
    Sprint 1 — Foundation (Tasks 1-5)
      Task  1: Define cache types & schema
      Task  2: Set up IndexedDB service layer
      Task  3: Video ↔ CachedVideo transforms
      Task  4: Cache service layer
      Task  5: Unit tests for foundation

    Sprint 2 — Core Integration (Tasks 6-10)
      Task  6: Integrate cache into video service
      Task  7: Update React Query hooks
      Task  8: Cache state Zustand store
      Task  9: Cache initialization & lifecycle
      Task 10: Integration tests

    Sprint 3 — Sync & Resilience (Tasks 11-14)
      Task 11: Background sync engine
      Task 12: Expiration tracking & block monitoring
      Task 13: Schema migration strategy
      Task 14: Error recovery & resilience

    Sprint 4 — UX & Polish (Tasks 15-18)
      Task 15: Expired video UI indicators
      Task 16: Cache management settings page
      Task 17: Export & import cache data
      Task 18: E2E tests & documentation
EOF
}

# ─── List all tasks ────────────────────────────────────────────────────

list_tasks() {
    echo ""
    print_header "Haven DApp — All Cache Tasks"

    printf "\n%-5s %-12s %-45s %-15s\n" "Task" "Sprint" "Task File" "Status"
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

        printf "%-5s %-12s %-45s %-15s\n" "$i" "$sprint" "$task_file" "$status"
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
            echo "    Command: kimi --yolo --prompt <README.md + $task_path>"
        else
            echo -e "    ${RED}✗ File not found!${NC}"
        fi

        echo ""
        ((i++))
    done

    print_success "Dry run complete. $TOTAL_TASKS tasks would be executed."
    print_info "Each task will be executed with README.md context for better AI understanding."
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