// Navigation: D.S., D.C., Coda, Fine playback order resolution
// Shared between MuseScore extension and Node.js CLI
//
// Input:
//   markers: [{ tick, label, type }]
//     type: "segno", "coda", "fine", "tocoda"
//   jumps: [{ tick, jumpTo, playUntil, continueAt, playRepeats }]
//   lastTick: end of score tick
//
// Output:
//   playbackPlan: [{ fromTick, toTick, honorRepeats }]

// Build a playback plan from navigation markers and jumps.
// Returns an ordered list of tick ranges representing the performance order.
// If no jumps exist, returns null (use default linear playback).
function buildPlaybackPlan(markers, jumps, lastTick) {
    if (!jumps || jumps.length === 0) return null;

    // Index markers by label for fast lookup
    var markerByLabel = {};
    for (var i = 0; i < markers.length; i++) {
        markerByLabel[markers[i].label] = markers[i];
    }

    // Sort jumps by tick (should only be one, but handle multiples)
    var sortedJumps = jumps.slice().sort(function(a, b) { return a.tick - b.tick; });

    var plan = [];
    var currentFrom = 0;

    for (var j = 0; j < sortedJumps.length; j++) {
        var jump = sortedJumps[j];

        // Segment 1: play from currentFrom to the jump position (inclusive)
        // The jump is at the END of a measure, so we play through that measure
        plan.push({
            fromTick: currentFrom,
            toTick: jump.tick + 1, // include the jump measure
            honorRepeats: true
        });

        // Resolve jump destination
        var jumpToTick = 0; // default: start of score
        if (jump.jumpTo && jump.jumpTo !== "start") {
            var jumpToMarker = markerByLabel[jump.jumpTo];
            if (jumpToMarker) {
                jumpToTick = jumpToMarker.tick;
            }
        }

        // Resolve play-until position
        var playUntilTick = lastTick; // default: end of score
        if (jump.playUntil && jump.playUntil !== "end") {
            var playUntilMarker = markerByLabel[jump.playUntil];
            if (playUntilMarker) {
                playUntilTick = playUntilMarker.tick;
            }
        }

        // Segment 2: jump back and play until the marker
        plan.push({
            fromTick: jumpToTick,
            toTick: playUntilTick,
            honorRepeats: jump.playRepeats || false
        });

        // Resolve continue-at position (for Coda)
        if (jump.continueAt) {
            var continueMarker = markerByLabel[jump.continueAt];
            if (continueMarker) {
                // Segment 3: coda section
                plan.push({
                    fromTick: continueMarker.tick,
                    toTick: lastTick,
                    honorRepeats: true
                });
            }
        }

        // If there are multiple jumps (unusual), the next segment starts after coda
        // For simplicity, we break after the first jump
        break;
    }

    return plan;
}

if (typeof exports !== "undefined") {
    exports.buildPlaybackPlan = buildPlaybackPlan;
}
