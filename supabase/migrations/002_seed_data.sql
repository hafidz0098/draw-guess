-- ============================================================
-- Seed: Categories, Words, Achievements, Quests, Shop, Emotes
-- ============================================================

-- Categories
INSERT INTO public.categories (name_en, name_id, slug, icon) VALUES
  ('Animals', 'Hewan', 'hewan', 'paw'),
  ('Food', 'Makanan', 'makanan', 'utensils'),
  ('Fruits', 'Buah', 'buah', 'apple'),
  ('Vehicles', 'Kendaraan', 'kendaraan', 'car'),
  ('Countries', 'Negara', 'negara', 'globe'),
  ('Cities', 'Kota', 'kota', 'building'),
  ('Professions', 'Profesi', 'profesi', 'briefcase'),
  ('Movies', 'Film', 'film', 'film'),
  ('Games', 'Game', 'game', 'gamepad'),
  ('Anime', 'Anime', 'anime', 'star'),
  ('Technology', 'Teknologi', 'teknologi', 'cpu'),
  ('Objects', 'Benda', 'benda', 'box'),
  ('Sports', 'Olahraga', 'olahraga', 'trophy'),
  ('Music', 'Musik', 'musik', 'music'),
  ('Figures', 'Tokoh', 'tokoh', 'user'),
  ('Cartoons', 'Kartun', 'kartun', 'smile');

-- Words (sample set — expand in production)
INSERT INTO public.words (category_id, word_en, word_id, difficulty)
SELECT c.id, v.word_en, v.word_id, v.difficulty
FROM (VALUES
  ('hewan', 'Cat', 'Kucing', 'easy'),
  ('hewan', 'Dog', 'Anjing', 'easy'),
  ('hewan', 'Elephant', 'Gajah', 'easy'),
  ('hewan', 'Butterfly', 'Kupu-kupu', 'medium'),
  ('hewan', 'Octopus', 'Gurita', 'medium'),
  ('hewan', 'Chameleon', 'Bunglon', 'hard'),
  ('makanan', 'Pizza', 'Pizza', 'easy'),
  ('makanan', 'Rice', 'Nasi', 'easy'),
  ('makanan', 'Sushi', 'Sushi', 'easy'),
  ('makanan', 'Satay', 'Sate', 'medium'),
  ('makanan', 'Rendang', 'Rendang', 'medium'),
  ('makanan', 'Croissant', 'Croissant', 'hard'),
  ('buah', 'Apple', 'Apel', 'easy'),
  ('buah', 'Banana', 'Pisang', 'easy'),
  ('buah', 'Durian', 'Durian', 'easy'),
  ('buah', 'Dragon Fruit', 'Buah Naga', 'medium'),
  ('buah', 'Rambutan', 'Rambutan', 'medium'),
  ('kendaraan', 'Car', 'Mobil', 'easy'),
  ('kendaraan', 'Bicycle', 'Sepeda', 'easy'),
  ('kendaraan', 'Airplane', 'Pesawat', 'easy'),
  ('kendaraan', 'Submarine', 'Kapal Selam', 'medium'),
  ('kendaraan', 'Helicopter', 'Helikopter', 'medium'),
  ('negara', 'Indonesia', 'Indonesia', 'easy'),
  ('negara', 'Japan', 'Jepang', 'easy'),
  ('negara', 'Brazil', 'Brasil', 'easy'),
  ('negara', 'Switzerland', 'Swiss', 'medium'),
  ('kota', 'Jakarta', 'Jakarta', 'easy'),
  ('kota', 'Tokyo', 'Tokyo', 'easy'),
  ('kota', 'Paris', 'Paris', 'easy'),
  ('kota', 'Yogyakarta', 'Yogyakarta', 'medium'),
  ('profesi', 'Doctor', 'Dokter', 'easy'),
  ('profesi', 'Teacher', 'Guru', 'easy'),
  ('profesi', 'Pilot', 'Pilot', 'easy'),
  ('profesi', 'Astronaut', 'Astronot', 'medium'),
  ('profesi', 'Archaeologist', 'Arkeolog', 'hard'),
  ('film', 'Titanic', 'Titanic', 'easy'),
  ('film', 'Avatar', 'Avatar', 'easy'),
  ('film', 'Spider-Man', 'Spider-Man', 'easy'),
  ('film', 'Inception', 'Inception', 'medium'),
  ('game', 'Minecraft', 'Minecraft', 'easy'),
  ('game', 'Among Us', 'Among Us', 'easy'),
  ('game', 'Genshin Impact', 'Genshin Impact', 'medium'),
  ('anime', 'Naruto', 'Naruto', 'easy'),
  ('anime', 'One Piece', 'One Piece', 'easy'),
  ('anime', 'Demon Slayer', 'Demon Slayer', 'medium'),
  ('teknologi', 'Phone', 'HP', 'easy'),
  ('teknologi', 'Computer', 'Komputer', 'easy'),
  ('teknologi', 'Robot', 'Robot', 'easy'),
  ('teknologi', 'Artificial Intelligence', 'Kecerdasan Buatan', 'hard'),
  ('benda', 'Chair', 'Kursi', 'easy'),
  ('benda', 'Clock', 'Jam', 'easy'),
  ('benda', 'Umbrella', 'Payung', 'easy'),
  ('benda', 'Telescope', 'Teleskop', 'medium'),
  ('olahraga', 'Football', 'Sepak Bola', 'easy'),
  ('olahraga', 'Basketball', 'Basket', 'easy'),
  ('olahraga', 'Badminton', 'Bulu Tangkis', 'easy'),
  ('olahraga', 'Archery', 'Panahan', 'medium'),
  ('musik', 'Guitar', 'Gitar', 'easy'),
  ('musik', 'Piano', 'Piano', 'easy'),
  ('musik', 'Drum', 'Drum', 'easy'),
  ('musik', 'Saxophone', 'Saksofon', 'medium'),
  ('tokoh', 'Einstein', 'Einstein', 'medium'),
  ('tokoh', 'Soekarno', 'Soekarno', 'medium'),
  ('kartun', 'SpongeBob', 'SpongeBob', 'easy'),
  ('kartun', 'Doraemon', 'Doraemon', 'easy'),
  ('kartun', 'Mickey Mouse', 'Mickey Mouse', 'easy')
) AS v(slug, word_en, word_id, difficulty)
JOIN public.categories c ON c.slug = v.slug
ON CONFLICT DO NOTHING;

-- Fix duplicate Einstein if any — ignore

-- Achievements
INSERT INTO public.achievements (slug, name_en, name_id, description_en, description_id, icon, xp_reward, coin_reward, criteria, rarity) VALUES
  ('guess_100', '100 Guesses', '100 Tebakan', 'Make 100 correct guesses', 'Berhasil menebak 100 kali', 'target', 100, 50, '{"type":"correct_guesses","value":100}', 'common'),
  ('guess_500', '500 Guesses', '500 Tebakan', 'Make 500 correct guesses', 'Berhasil menebak 500 kali', 'target', 300, 150, '{"type":"correct_guesses","value":500}', 'rare'),
  ('win_100', '100 Wins', '100 Kemenangan', 'Win 100 games', 'Menang 100 pertandingan', 'trophy', 200, 100, '{"type":"wins","value":100}', 'rare'),
  ('perfect_artist', 'Perfect Artist', 'Seniman Sempurna', 'Everyone guesses your drawing', 'Semua orang menebak gambarmu', 'palette', 150, 75, '{"type":"perfect_round","value":1}', 'epic'),
  ('fast_guesser', 'Fast Guesser', 'Penebak Cepat', 'Guess correctly in under 5 seconds', 'Tebak benar di bawah 5 detik', 'zap', 80, 40, '{"type":"fast_guess","value":1}', 'common'),
  ('legend', 'Legend', 'Legenda', 'Reach level 50', 'Capai level 50', 'crown', 500, 250, '{"type":"level","value":50}', 'legendary'),
  ('top_1', 'Top 1', 'Peringkat 1', 'Reach #1 on leaderboard', 'Capai peringkat 1 leaderboard', 'medal', 400, 200, '{"type":"rank","value":1}', 'legendary'),
  ('veteran', 'Veteran', 'Veteran', 'Play 200 games', 'Main 200 pertandingan', 'shield', 250, 125, '{"type":"games","value":200}', 'epic'),
  ('collector', 'Collector', 'Kolektor', 'Own 20 shop items', 'Punya 20 item toko', 'package', 150, 75, '{"type":"inventory","value":20}', 'rare'),
  ('master_drawer', 'Master Drawer', 'Master Gambar', 'Draw 100 rounds', 'Menggambar 100 ronde', 'pencil', 200, 100, '{"type":"draws","value":100}', 'epic');

-- Daily Quests
INSERT INTO public.daily_quests (slug, name_en, name_id, description_en, description_id, target_value, criteria_type, xp_reward, coin_reward) VALUES
  ('play_3', 'Play 3 Games', 'Main 3 Game', 'Complete 3 matches today', 'Selesaikan 3 pertandingan hari ini', 3, 'play_games', 40, 20),
  ('win_1', 'Win 1 Game', 'Menang 1 Game', 'Win a match today', 'Menangkan 1 pertandingan hari ini', 1, 'win_games', 50, 30),
  ('guess_10', 'Guess 10', 'Tebak 10', 'Make 10 correct guesses', 'Tebak benar 10 kali', 10, 'guess_correct', 35, 15),
  ('draw_5', 'Draw 5 Rounds', 'Gambar 5 Ronde', 'Draw in 5 rounds', 'Menggambar di 5 ronde', 5, 'draw_rounds', 40, 20),
  ('login_daily', 'Daily Login', 'Login Harian', 'Log in today', 'Login hari ini', 1, 'login', 20, 10);

-- Shop Items
INSERT INTO public.shop_items (slug, name_en, name_id, description_en, description_id, item_type, price_coins, rarity, asset_data) VALUES
  ('brush_neon', 'Neon Brush', 'Kuas Neon', 'Bright neon strokes', 'Goresan neon cerah', 'brush', 150, 'rare', '{"strokeStyle":"neon"}'),
  ('brush_watercolor', 'Watercolor', 'Cat Air', 'Soft watercolor effect', 'Efek cat air lembut', 'brush', 200, 'epic', '{"strokeStyle":"watercolor"}'),
  ('pen_marker', 'Bold Marker', 'Spidol Tebal', 'Thick marker pen', 'Spidol tebal tegas', 'pen', 100, 'common', '{}'),
  ('theme_sunset', 'Sunset Theme', 'Tema Senja', 'Warm orange UI theme', 'Tema UI oranye hangat', 'color_theme', 250, 'rare', '{"primary":"#F97316"}'),
  ('theme_ocean', 'Ocean Theme', 'Tema Laut', 'Cool blue UI theme', 'Tema UI biru sejuk', 'color_theme', 250, 'rare', '{"primary":"#3B82F6"}'),
  ('frame_gold', 'Gold Frame', 'Bingkai Emas', 'Golden avatar frame', 'Bingkai avatar emas', 'frame', 300, 'epic', '{}'),
  ('frame_rainbow', 'Rainbow Frame', 'Bingkai Pelangi', 'Rainbow avatar frame', 'Bingkai avatar pelangi', 'frame', 400, 'legendary', '{}'),
  ('title_artist', 'Artist', 'Seniman', 'Title: Artist', 'Gelar: Seniman', 'title', 120, 'common', '{"title":"Artist"}'),
  ('title_pro', 'Pro Drawer', 'Pro Drawer', 'Title: Pro Drawer', 'Gelar: Pro Drawer', 'title', 200, 'rare', '{"title":"Pro Drawer"}'),
  ('emote_party', 'Party Emote', 'Emote Pesta', '🎉 party emote', 'Emote pesta 🎉', 'emote', 80, 'common', '{"emoji":"🎉"}'),
  ('emote_fire', 'Fire Emote', 'Emote Api', '🔥 fire emote', 'Emote api 🔥', 'emote', 80, 'common', '{"emoji":"🔥"}'),
  ('cursor_pencil', 'Pencil Cursor', 'Kursor Pensil', 'Pencil-shaped cursor', 'Kursor berbentuk pensil', 'cursor', 100, 'common', '{}'),
  ('trail_stars', 'Star Trail', 'Jejak Bintang', 'Star cursor trail', 'Jejak kursor bintang', 'trail', 180, 'rare', '{}'),
  ('sticker_star', 'Star Sticker', 'Stiker Bintang', 'Place star stickers', 'Stiker bintang', 'sticker', 60, 'common', '{}'),
  ('bg_grid', 'Grid Background', 'Latar Kotak', 'Grid canvas background', 'Latar kanvas kotak-kotak', 'background', 90, 'common', '{}');

-- Emotes
INSERT INTO public.emotes (slug, emoji, name, is_default) VALUES
  ('laugh', '😂', 'Laugh', true),
  ('clap', '👏', 'Clap', true),
  ('fire', '🔥', 'Fire', true),
  ('think', '🤔', 'Think', true),
  ('heart', '❤️', 'Heart', true),
  ('cry', '😭', 'Cry', true),
  ('party', '🎉', 'Party', true),
  ('thumbs', '👍', 'Thumbs Up', true);

-- App settings
INSERT INTO public.app_settings (key, value, description) VALUES
  ('maintenance', '{"enabled": false, "message": ""}', 'Maintenance mode'),
  ('chat_rate_limit', '{"max_per_minute": 20, "max_length": 200}', 'Chat anti-spam limits'),
  ('version', '{"min_client": "1.0.0"}', 'Client version gate');
