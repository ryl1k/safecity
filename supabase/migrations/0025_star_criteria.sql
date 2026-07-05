-- Re-point the "star" (critical) wheelchair criteria: a ramp (пандус) is a
-- make-or-break alternative to a step-free entrance, so it earns a ★; an accessible
-- toilet matters for long stays but isn't an entry blocker, so it loses its ★.
-- Stars now = step-free entrance, wide doors, ramp. Drives both the ★ in the point
-- checklist and the "2 stars → at least Medium" floor in the accessibility level.
update accessibility_features set critical = true  where key = 'ramp';
update accessibility_features set critical = false where key = 'accessible_toilet';
