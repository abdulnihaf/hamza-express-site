-- Hamza Express — Seed clip data from CLIP-INTELLIGENCE.md
-- Run AFTER schema-clips.sql: wrangler d1 execute hamza-express-db --file=seed-clips.sql

-- SOURCE: HANIN (Videographer) — 32 unique clips
INSERT OR IGNORE INTO clips (id, source, filename, duration_s, resolution, tags, description, viral_score) VALUES
('H01', 'hanin', 'IMG_8145.MP4', 3, '4K', 'TANDOOR,COOK,FOOD', 'Tandoor chicken pulled out on skewers + marinated tray', 8),
('H02', 'hanin', 'IMG_8146.MP4', 3, '4K', 'TANDOOR,FIRE', 'Inside tandoor — chicken frying, dark moody', 6),
('H03', 'hanin', 'IMG_8147.MP4', 2, '4K', 'COOK,FOOD', 'Large bowl of orange marinated chicken close-up', 8),
('H04', 'hanin', 'IMG_8151.MP4', 3, '4K', 'PEOPLE,COOK', 'Staff in red/black lifting large vessel', 6),
('H05', 'hanin', 'IMG_8153.MP4', 2, '4K', 'FIRE', 'Wood fire burning in brick oven, dramatic', 7),
('H06', 'hanin', 'IMG_8158.MP4', 2, '4K', 'PEOPLE,FIRE', 'Chef in white kurta by wood fire, camera look', 8),
('H07', 'hanin', 'IMG_8159.MP4', 3, '4K', 'FIRE', 'Close-up wood fire with vessel, flames licking', 7),
('H08', 'hanin', 'IMG_8160.MP4', 4, '4K', 'FIRE', 'Wider fire shot, wood logs burning', 5),
('H09', 'hanin', 'IMG_8161.MP4', 2, '4K', 'FIRE', 'Fire continuing, similar angle to H07', 4),
('H10', 'hanin', 'IMG_8170.MP4', 1, '4K', 'FIRE,STREET', 'OIL POURED ON FLAME — massive burst, Shivajinagar behind', 10),
('H11', 'hanin', 'IMG_8178.MP4', 2, '4K', 'GRILL,FOOD', 'Kebabs on charcoal grill, tongs flipping, customers', 8),
('H12', 'hanin', 'IMG_8192.MP4', 2, '4K', 'VENUE,BRAND', 'Counter — QR code, KITCHEN COUNTER sign, logo lit', 7),
('H13', 'hanin', 'IMG_8200.MP4', 2, '4K', 'COOK', 'Chef at stove, kadai cooking', 5),
('H14', 'hanin', 'IMG_8204.MP4', 3, '4K', 'COOK,FOOD', 'Wok toss — chef cooking with tongs, saucy dish', 8),
('H15', 'hanin', 'IMG_8205.MP4', 5, '4K', 'COOK,FOOD', 'Same wok, longer take, chef flipping (LONGEST CLIP)', 9),
('H16', 'hanin', 'IMG_8206.MP4', 2, '4K', 'COOK', 'Same station, different angle', 5),
('H17', 'hanin', 'IMG_8208.MP4', 1, '4K', 'COOK,FOOD', 'Plating — food from wok to plate', 7),
('H18', 'hanin', 'IMG_8209.MP4', 2, '4K', 'VENUE,BRAND', 'Interior entrance — diamond wall, neon Hamza Express on floor', 9),
('H19', 'hanin', 'IMG_8210.MP4', 2, '4K', 'VENUE,FOOD', 'Bain marie counter, menu boards, LED lighting', 7),
('H20', 'hanin', 'IMG_8211.MP4', 3, '4K', 'VENUE', 'Wide interior — arch doorway, warm lights, diamond wall', 8),
('H21', 'hanin', 'IMG_8212.MP4', 3, '4K', 'VENUE', 'Similar interior, wider angle', 6),
('H22', 'hanin', 'IMG_8213.MP4', 2, '4K', 'VENUE,BRAND', 'Close-up menu board, Hamza Express frame, QR code', 5),
('H23', 'hanin', 'IMG_8218.MP4', 2, '4K', 'PEOPLE', 'Young man in red flannel, camera look, red tile kitchen', 7),
('H24', 'hanin', 'IMG_8219.MP4', 1, '4K', 'PEOPLE', 'Older man, grey hair, Explorer tee, camera look', 7),
('H25', 'hanin', 'IMG_8233.MP4', 2, '1080p', 'FOOD', 'Biryani thali top-down — biryani, raita, cucumber, salan', 10),
('H26', 'hanin', 'IMG_8234.MP4', 2, '1080p', 'FOOD', 'Same thali wider — onion rings, lime, full spread', 10),
('H27', 'hanin', 'IMG_8900.MOV', 4, '4K', 'STREET', 'EPIC Shivajinagar night — massive crowd, autos, neon, clock tower', 10),
('H28', 'hanin', 'IMG_8901.MOV', 1, '1080p', 'EXTERIOR,BRAND', 'Hamza Express storefront — logo lit, DINE-IN sign, crowd', 9),
('H29', 'hanin', 'IMG_8903.MOV', 2, '1080p', 'EXTERIOR,BRAND', 'Hamza Hotel sign lit, Kannada/Urdu, crowded street', 7),
('H30', 'hanin', 'IMG_8904.MOV', 1, '1080p', 'EXTERIOR', 'Wider angle same area', 5),
('H31', 'hanin', 'IMG_8906.MOV', 2, '1080p', 'GRILL,FIRE,STREET', 'Outdoor massive fire/grill, Eid Mubarak poster behind', 7),
('H32', 'hanin', 'IMG_8908.MOV', 3, '1080p', 'FIRE', 'FULL FRAME FIRE — massive flames, black background', 10);

-- SOURCE: HAMZA (Restaurant Staff) — 10 clips
INSERT OR IGNORE INTO clips (id, source, filename, duration_s, resolution, tags, description, viral_score) VALUES
('Z01', 'hamza', 'IMG_6238.MOV', 10, '1080p', 'TESTIMONIAL,PEOPLE,FOOD', 'Two kids eating at table, talking about food (Hindi), smiling at camera — family dining scene', 9),
('Z02', 'hamza', 'IMG_6241.MOV', 4, '1080p', 'FOOD,PEOPLE', 'Table spread — kids eating, multiple plates with chicken/roti, window view, menu card visible', 8),
('Z03', 'hamza', 'IMG_6249.MOV', 3, '4K', 'STREET', 'Shivajinagar at night — clock tower, smoke, massive crowd, ROOMS neon sign', 9),
('Z04', 'hamza', 'IMG_6250.MOV', 2, '1080p', 'STREET,BRAND', 'Namma Shivajinagar sign in Kannada — heart logo, cultural identity', 8),
('Z05', 'hamza', 'IMG_6252.MOV', 5, '1080p', 'EXTERIOR,BRAND', 'Hamza Express full storefront — logo, awning, person sitting, scooters, night shot', 9),
('Z06', 'hamza', 'IMG_6253.MOV', 13, '4K', 'BRAND,EXTERIOR', 'Close-up Hamza Express logo on signboard — founder illustration, gold circle, lit up at night', 9),
('Z07', 'hamza', 'IMG_6254.MOV', 5, '1080p', 'FOOD,TANDOOR', 'Tandoor kebabs hanging in glass display case — golden chicken skewers', 8),
('Z08', 'hamza', 'IMG_6255.MOV', 2, '1080p', 'TANDOOR,FIRE,FOOD', 'Looking INSIDE tandoor — skewers with chicken over glowing red coals', 10),
('Z09', 'hamza', 'IMG_6257.MOV', 12, '1080p', 'BRAND', 'Founder portrait close-up — lit circle logo with EST. 1... text, heritage vibes', 9),
('Z10', 'hamza', 'IMG_6258.MOV', 6, '1080p', 'PEOPLE,VENUE', 'Older man at counter giving peace sign — behind Acer monitor, pendant light, red tile wall', 7);
