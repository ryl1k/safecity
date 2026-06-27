-- Avoid the "≥" glyph in labels — screen readers announce it as "greater than or
-- equal to", which is confusing in an accessibility checklist. Use plain wording.
update accessibility_features set label = 'Широкі двері (від 80 см)' where key = 'door_width';
