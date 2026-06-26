-- Accessibility feature catalog (KB 04 taxonomy). `critical` features drive the
-- per-(category,profile) traffic-light in the shared rules engine. UA labels.

insert into accessibility_features (key, label, profile, categories, critical) values
  -- Venue · wheelchair
  ('step_free_entrance',        'Вхід без сходів',            'wheelchair', '{venue}',          true),
  ('ramp',                      'Пандус',                    'wheelchair', '{venue}',          false),
  ('ramp_slope_ok',             'Пологий пандус',            'wheelchair', '{venue}',          false),
  ('door_width',                'Широкі двері (≥80 см)',     'wheelchair', '{venue,toilet}',   true),
  ('elevator',                  'Ліфт до потрібних поверхів','wheelchair', '{venue}',          false),
  ('accessible_toilet',         'Доступний туалет',          'wheelchair', '{venue}',          true),
  ('level_interior',            'Рівна підлога всередині',   'wheelchair', '{venue}',          false),
  ('accessible_parking_near',   'Доступне паркування поруч', 'wheelchair', '{venue}',          false),
  -- Venue · blind
  ('tactile_guidance_entrance', 'Тактильні орієнтири до входу','blind',    '{venue}',          true),
  ('braille_signage',           'Шрифт Брайля / великий шрифт','blind',    '{venue,toilet}',   false),
  ('staff_assistance',          'Допомога персоналу',        'blind',      '{venue}',          true),
  ('good_lighting',             'Гарне освітлення',          'blind',      '{venue}',          false),
  ('guide_dog_welcome',         'Можна із собакою-поводирем','blind',      '{venue}',          false),
  -- Transit · wheelchair
  ('level_boarding',            'Рівна посадка',             'wheelchair', '{transit}',        true),
  ('step_free_to_stop',         'Доступ до зупинки без сходів','wheelchair','{transit}',       true),
  ('low_floor_vehicles',        'Низькопідлоговий транспорт','wheelchair', '{transit}',        false),
  -- Transit/Crossing · blind
  ('tactile_paving',            'Тактильна плитка',          'blind',      '{transit,crossing}',true),
  ('audio_announcements',       'Аудіо-оголошення зупинок',  'blind',      '{transit}',        true),
  ('high_contrast_edge',        'Контрастна крайка',         'blind',      '{transit}',        false),
  -- Crossing · wheelchair
  ('dropped_curb',              'Знижений бордюр',           'wheelchair', '{crossing}',       true),
  ('level_crossing',            'Рівний перехід',            'wheelchair', '{crossing}',       false),
  ('island_refuge',             'Острівець безпеки',         'wheelchair', '{crossing}',       false),
  -- Crossing · blind
  ('acoustic_signal',           'Звуковий сигнал',           'blind',      '{crossing}',       true),
  ('tactile_cone',              'Тактильний конус під кнопкою','blind',    '{crossing}',       false),
  ('adequate_crossing_time',    'Достатній час переходу',    'blind',      '{crossing}',       false),
  -- Toilet · wheelchair
  ('accessible_stall',          'Доступна кабінка',          'wheelchair', '{toilet}',         true),
  ('grab_bars',                 'Поручні',                   'wheelchair', '{toilet}',         true),
  ('turning_space',             'Простір для розвороту',     'wheelchair', '{toilet}',         false),
  ('emergency_cord',            'Аварійний шнур',            'wheelchair', '{toilet}',         false),
  ('eurokey',                   'Замок EuroKey',             'wheelchair', '{toilet}',         false),
  -- Toilet · blind
  ('tactile_layout',            'Тактильне планування',      'blind',      '{toilet}',         false),
  -- Parking · wheelchair
  ('disabled_bay',              'Місце для людей з інвалідністю','wheelchair','{parking}',     true),
  ('bay_width',                 'Широке місце',              'wheelchair', '{parking}',        false),
  ('near_entrance',             'Біля входу',                'wheelchair', '{parking}',        false),
  ('firm_surface',              'Тверде рівне покриття',     'wheelchair', '{parking}',        false)
on conflict (key) do nothing;
