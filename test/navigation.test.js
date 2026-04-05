var { describe, it } = require("node:test");
var assert = require("node:assert/strict");
var { buildPlaybackPlan } = require("../lib/navigation");

describe("navigation", function() {

    describe("buildPlaybackPlan", function() {

        it("returns null when no jumps exist", function() {
            var result = buildPlaybackPlan([], [], 1000);
            assert.equal(result, null);
        });

        it("returns null when jumps is null", function() {
            var result = buildPlaybackPlan([], null, 1000);
            assert.equal(result, null);
        });

        it("handles D.C. (Da Capo) - jump to start, play to end", function() {
            var markers = [];
            var jumps = [{ tick: 960, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: false }];
            var plan = buildPlaybackPlan(markers, jumps, 1920);

            assert.equal(plan.length, 2);
            // Segment 1: play from start to jump
            assert.equal(plan[0].fromTick, 0);
            assert.equal(plan[0].toTick, 961);
            assert.equal(plan[0].honorRepeats, true);
            // Segment 2: jump back to start, play to end
            assert.equal(plan[1].fromTick, 0);
            assert.equal(plan[1].toTick, 1920);
            assert.equal(plan[1].honorRepeats, false);
        });

        it("handles D.C. al Fine", function() {
            var markers = [
                { tick: 480, label: "fine", type: "fine" }
            ];
            var jumps = [{ tick: 960, jumpTo: "start", playUntil: "fine", continueAt: "", playRepeats: false }];
            var plan = buildPlaybackPlan(markers, jumps, 1920);

            assert.equal(plan.length, 2);
            assert.equal(plan[0].fromTick, 0);
            assert.equal(plan[0].toTick, 961);
            // Segment 2: jump to start, play until Fine
            assert.equal(plan[1].fromTick, 0);
            assert.equal(plan[1].toTick, 480);
            assert.equal(plan[1].honorRepeats, false);
        });

        it("handles D.S. al Coda", function() {
            var markers = [
                { tick: 480, label: "segno", type: "segno" },
                { tick: 1440, label: "coda", type: "tocoda" },
                { tick: 1920, label: "codab", type: "coda" }
            ];
            var jumps = [{
                tick: 2400,
                jumpTo: "segno",
                playUntil: "coda",
                continueAt: "codab",
                playRepeats: false
            }];
            var plan = buildPlaybackPlan(markers, jumps, 3840);

            assert.equal(plan.length, 3);
            // Segment 1: play from start to jump
            assert.equal(plan[0].fromTick, 0);
            assert.equal(plan[0].toTick, 2401);
            assert.equal(plan[0].honorRepeats, true);
            // Segment 2: jump to segno, play until tocoda
            assert.equal(plan[1].fromTick, 480);
            assert.equal(plan[1].toTick, 1440);
            assert.equal(plan[1].honorRepeats, false);
            // Segment 3: continue at coda to end
            assert.equal(plan[2].fromTick, 1920);
            assert.equal(plan[2].toTick, 3840);
            assert.equal(plan[2].honorRepeats, true);
        });

        it("handles D.S. al Fine", function() {
            var markers = [
                { tick: 480, label: "segno", type: "segno" },
                { tick: 1440, label: "fine", type: "fine" }
            ];
            var jumps = [{
                tick: 1920,
                jumpTo: "segno",
                playUntil: "fine",
                continueAt: "",
                playRepeats: false
            }];
            var plan = buildPlaybackPlan(markers, jumps, 2400);

            assert.equal(plan.length, 2);
            // Segment 1: play from start to jump
            assert.equal(plan[0].fromTick, 0);
            assert.equal(plan[0].toTick, 1921);
            // Segment 2: jump to segno, play until fine
            assert.equal(plan[1].fromTick, 480);
            assert.equal(plan[1].toTick, 1440);
            assert.equal(plan[1].honorRepeats, false);
        });

        it("honors playRepeats flag", function() {
            var markers = [];
            var jumps = [{ tick: 960, jumpTo: "start", playUntil: "end", continueAt: "", playRepeats: true }];
            var plan = buildPlaybackPlan(markers, jumps, 1920);

            assert.equal(plan[1].honorRepeats, true);
        });
    });
});
