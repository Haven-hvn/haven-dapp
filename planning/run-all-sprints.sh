#!/bin/bash
# Haven DApp — Unified Cache Sprint Orchestration Script
# =======================================================
# Runs both cache implementation plans in the correct dependency order:
#   1. Arkiv Cache  (metadata foundation — 18 tasks, 4 sprints)
#   2. Video Cache  (content optimization — 25 tasks, 6 sprints)
#
# Usage: ./run-all-sprints.sh [OPTIONS]
#
# Options:
#   --dry-run, -d         Preview tasks for both plans without running kimi
#   --list, -l            List all tasks for both plans
#   --arkiv-only          Run only the Arkiv Cache sprints
#   --video-only          Run only the Video Cache sprints
#   --arkiv-start N       Start Arkiv Cache from task N
#   --video-start N       Start Video Cache from task N
#   --skip-arkiv          Skip Arkiv Cache (resume from Video Cache)
#   --help, -h            Show this help message
#
# Progress is tracked separately in each plan's SPRINT_PROGRESS.md

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARKIV_SCRIPT="$SCRIPT_DIR/arkiv-cache/run-sprints.sh"
VIDEO_SCRIPT="$SCRIPT_DIR/video-cache/run-sprints.sh"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Defaults
RUN_ARKIV=true
RUN_VIDEO=true
ARKIV_START=""
VIDEO_START=""
DRY_RUN=false
LIST_ONLY=false

# ─── Output helpers ───────────────────────────────────────────────────

print_banner() {
    echo ""
    echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║                                                          ║${NC}"
    echo -e "${MAGENTA}║   Haven DApp — Unified Cache Sprint Orchestrator         ║${NC}"
    echo -e "${MAGENTA}║                                                          ║${NC}"
    echo -e "${MAGENTA}║   Phase 1: Arkiv Cache   (metadata foundation)           ║${NC}"
    echo -e "${MAGENTA}║   Phase 2: Video Cache   (content optimization)          ║${NC}"
    echo -e "${MAGENTA}║                                                          ║${NC}"
    echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_phase_header() {
    local phase_num=$1
    local phase_name=$2
    local task_count=$3
    local sprint_count=$4

    echo ""
    echo -e "${MAGENTA}┌──────────────────────────────────────────────────────────┐${NC}"
    echo -e "${MAGENTA}│  PHASE $phase_num: $phase_name${NC}"
    echo -e "${MAGENTA}│  $task_count tasks across $sprint_count sprints${NC}"
    echo -e "${MAGENTA}└──────────────────────────────────────────────────────────┘${NC}"
    echo ""
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

# ─── Prerequisite checks ──────────────────────────────────────────────

check_scripts_exist() {
    local missing=false

    if [[ "$RUN_ARKIV" == true ]] && [[ ! -f "$ARKIV_SCRIPT" ]]; then
        print_error "Arkiv Cache script not found: $ARKIV_SCRIPT"
        missing=true
    fi

    if [[ "$RUN_VIDEO" == true ]] && [[ ! -f "$VIDEO_SCRIPT" ]]; then
        print_error "Video Cache script not found: $VIDEO_SCRIPT"
        missing=true
    fi

    if [[ "$missing" == true ]]; then
        exit 1
    fi

    # Ensure scripts are executable
    if [[ "$RUN_ARKIV" == true ]]; then
        chmod +x "$ARKIV_SCRIPT"
        print_success "Arkiv Cache script: $ARKIV_SCRIPT"
    fi

    if [[ "$RUN_VIDEO" == true ]]; then
        chmod +x "$VIDEO_SCRIPT"
        print_success "Video Cache script: $VIDEO_SCRIPT"
    fi
}

# ─── Run phases ────────────────────────────────────────────────────────

run_arkiv_phase() {
    print_phase_header "1" "Arkiv Cache (Metadata Foundation)" "18" "4"

    local args=()
    if [[ -n "$ARKIV_START" ]]; then
        args+=("$ARKIV_START")
    fi

    local exit_code=0
    "$ARKIV_SCRIPT" "${args[@]}" || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        echo ""
        print_success "Phase 1 (Arkiv Cache) completed successfully!"
        return 0
    else
        echo ""
        print_error "Phase 1 (Arkiv Cache) finished with errors (exit code: $exit_code)"
        return $exit_code
    fi
}

run_video_phase() {
    print_phase_header "2" "Video Cache (Content Optimization)" "25" "6"

    local args=()
    if [[ -n "$VIDEO_START" ]]; then
        args+=("$VIDEO_START")
    fi

    local exit_code=0
    "$VIDEO_SCRIPT" "${args[@]}" || exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        echo ""
        print_success "Phase 2 (Video Cache) completed successfully!"
        return 0
    else
        echo ""
        print_error "Phase 2 (Video Cache) finished with errors (exit code: $exit_code)"
        return $exit_code
    fi
}

# ─── Main execution ───────────────────────────────────────────────────

main() {
    print_banner

    print_info "Checking prerequisites..."
    check_scripts_exist
    echo ""

    local arkiv_exit=0
    local video_exit=0

    # Phase 1: Arkiv Cache
    if [[ "$RUN_ARKIV" == true ]]; then
        run_arkiv_phase || arkiv_exit=$?

        if [[ $arkiv_exit -ne 0 ]] && [[ "$RUN_VIDEO" == true ]]; then
            echo ""
            print_warning "Phase 1 had failures. Proceeding to Phase 2 in 5 seconds..."
            print_info "Press Ctrl+C to abort"
            sleep 5
        fi

        # Transition pause between phases
        if [[ "$RUN_VIDEO" == true ]]; then
            echo ""
            echo -e "${MAGENTA}══════════════════════════════════════════════════════════${NC}"
            echo -e "${MAGENTA}  Phase 1 complete. Transitioning to Phase 2...${NC}"
            echo -e "${MAGENTA}══════════════════════════════════════════════════════════${NC}"
            echo ""
            print_info "Starting Video Cache sprints in 5 seconds..."
            print_info "Press Ctrl+C to stop"
            sleep 5
        fi
    fi

    # Phase 2: Video Cache
    if [[ "$RUN_VIDEO" == true ]]; then
        run_video_phase || video_exit=$?
    fi

    # Final summary
    echo ""
    echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║              UNIFIED SPRINT EXECUTION COMPLETE           ║${NC}"
    echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [[ "$RUN_ARKIV" == true ]]; then
        if [[ $arkiv_exit -eq 0 ]]; then
            print_success "Phase 1 — Arkiv Cache:  PASSED"
        else
            print_error "Phase 1 — Arkiv Cache:  FAILED (exit code: $arkiv_exit)"
        fi
        print_info "  Progress: $SCRIPT_DIR/arkiv-cache/SPRINT_PROGRESS.md"
    else
        print_info "Phase 1 — Arkiv Cache:  SKIPPED"
    fi

    if [[ "$RUN_VIDEO" == true ]]; then
        if [[ $video_exit -eq 0 ]]; then
            print_success "Phase 2 — Video Cache:  PASSED"
        else
            print_error "Phase 2 — Video Cache:  FAILED (exit code: $video_exit)"
        fi
        print_info "  Progress: $SCRIPT_DIR/video-cache/SPRINT_PROGRESS.md"
    else
        print_info "Phase 2 — Video Cache:  SKIPPED"
    fi

    echo ""

    # Return non-zero if either phase failed
    if [[ $arkiv_exit -ne 0 ]] || [[ $video_exit -ne 0 ]]; then
        return 1
    fi
    return 0
}

# ─── Help ──────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
Haven DApp — Unified Cache Sprint Orchestration Script
========================================================

Runs both cache implementation plans in the correct dependency order:
  Phase 1: Arkiv Cache   — metadata foundation (18 tasks, 4 sprints)
  Phase 2: Video Cache   — content optimization (25 tasks, 6 sprints)

The Arkiv Cache must be implemented first because it provides the
metadata persistence layer (IndexedDB) that the Video Cache depends on.
Video content caching requires CIDs and encryption metadata from the
Arkiv Cache to function after entity expiration.

USAGE:
    ./run-all-sprints.sh [OPTIONS]

OPTIONS:
    --dry-run, -d         Preview tasks for both plans without running kimi
    --list, -l            List all tasks for both plans with status
    --arkiv-only          Run only the Arkiv Cache sprints
    --video-only          Run only the Video Cache sprints
    --arkiv-start N       Start Arkiv Cache from task N (1-18)
    --video-start N       Start Video Cache from task N (1-25)
    --skip-arkiv          Skip Arkiv Cache, run only Video Cache
    --help, -h            Show this help message

EXAMPLES:
    ./run-all-sprints.sh                    # Run everything: Arkiv then Video
    ./run-all-sprints.sh --arkiv-only       # Run only Arkiv Cache sprints
    ./run-all-sprints.sh --video-only       # Run only Video Cache sprints
    ./run-all-sprints.sh --arkiv-start 6    # Start Arkiv from task 6, then all Video
    ./run-all-sprints.sh --video-start 14   # All Arkiv, then Video from task 14
    ./run-all-sprints.sh --skip-arkiv       # Skip Arkiv, run Video from beginning
    ./run-all-sprints.sh --dry-run          # Preview all tasks for both plans
    ./run-all-sprints.sh --list             # List all tasks with status

PROGRESS TRACKING:
    Each plan tracks progress independently:
      planning/arkiv-cache/SPRINT_PROGRESS.md
      planning/video-cache/SPRINT_PROGRESS.md

TOTAL TASKS: 43 (18 Arkiv + 25 Video)
EOF
}

# ─── List tasks ────────────────────────────────────────────────────────

list_all_tasks() {
    print_banner

    if [[ -f "$ARKIV_SCRIPT" ]]; then
        echo -e "${MAGENTA}── Phase 1: Arkiv Cache ──────────────────────────────────${NC}"
        "$ARKIV_SCRIPT" --list
    fi

    echo ""

    if [[ -f "$VIDEO_SCRIPT" ]]; then
        echo -e "${MAGENTA}── Phase 2: Video Cache ──────────────────────────────────${NC}"
        "$VIDEO_SCRIPT" --list
    fi
}

# ─── Dry run ───────────────────────────────────────────────────────────

dry_run_all() {
    print_banner

    if [[ "$RUN_ARKIV" == true ]] && [[ -f "$ARKIV_SCRIPT" ]]; then
        echo -e "${MAGENTA}── Phase 1: Arkiv Cache (Dry Run) ────────────────────────${NC}"
        "$ARKIV_SCRIPT" --dry-run
    fi

    echo ""

    if [[ "$RUN_VIDEO" == true ]] && [[ -f "$VIDEO_SCRIPT" ]]; then
        echo -e "${MAGENTA}── Phase 2: Video Cache (Dry Run) ────────────────────────${NC}"
        "$VIDEO_SCRIPT" --dry-run
    fi

    echo ""
    print_success "Dry run complete. 43 total tasks would be executed (18 Arkiv + 25 Video)."
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
                list_all_tasks
                exit 0
                ;;
            --dry-run|-d)
                dry_run_all
                exit 0
                ;;
            --arkiv-only)
                RUN_ARKIV=true
                RUN_VIDEO=false
                shift
                ;;
            --video-only)
                RUN_ARKIV=false
                RUN_VIDEO=true
                shift
                ;;
            --skip-arkiv)
                RUN_ARKIV=false
                RUN_VIDEO=true
                shift
                ;;
            --arkiv-start)
                if [[ -n "$2" ]] && [[ "$2" =~ ^[0-9]+$ ]]; then
                    ARKIV_START="$2"
                    shift 2
                else
                    print_error "--arkiv-start requires a task number"
                    exit 1
                fi
                ;;
            --video-start)
                if [[ -n "$2" ]] && [[ "$2" =~ ^[0-9]+$ ]]; then
                    VIDEO_START="$2"
                    shift 2
                else
                    print_error "--video-start requires a task number"
                    exit 1
                fi
                ;;
            *)
                print_error "Unknown option: $1"
                echo ""
                show_help
                exit 1
                ;;
        esac
    done
}

# ─── Interrupt handler ────────────────────────────────────────────────

trap 'echo ""; print_warning "Interrupted by user."; echo "Progress saved to each plan'\''s SPRINT_PROGRESS.md"; exit 0' INT TERM

# ─── Entry point ──────────────────────────────────────────────────────

parse_args "$@"
main