-- ============================================================
-- Fix infinite recursion between rooms ↔ room_members RLS
-- + allow lookup room by code for join
-- Jalankan di Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_room_member(rid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = rid AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_public_room(rid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = rid AND is_private = false AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_room_host(rid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = rid AND host_id = auth.uid() AND deleted_at IS NULL
  );
$$;

DROP POLICY IF EXISTS "Public rooms readable" ON public.rooms;
DROP POLICY IF EXISTS "Host can update room" ON public.rooms;
DROP POLICY IF EXISTS "Authenticated can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "Members viewable by room members" ON public.room_members;
DROP POLICY IF EXISTS "Users can update own membership" ON public.room_members;
DROP POLICY IF EXISTS "Users can leave rooms" ON public.room_members;
DROP POLICY IF EXISTS "Users can join rooms" ON public.room_members;

-- Anyone authenticated can SELECT rooms that are waiting (join by code)
-- Private rooms still require knowing the code (code is the secret)
CREATE POLICY "Rooms readable for play"
  ON public.rooms FOR SELECT
  USING (
    deleted_at IS NULL AND (
      status IN ('waiting', 'playing', 'finished')
      OR host_id = auth.uid()
      OR public.is_room_member(id)
    )
  );

CREATE POLICY "Authenticated can create rooms"
  ON public.rooms FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update room"
  ON public.rooms FOR UPDATE
  USING (
    host_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Members viewable"
  ON public.room_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_room_member(room_id)
    OR public.is_public_room(room_id)
    OR EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_members.room_id
        AND r.deleted_at IS NULL
        AND r.status IN ('waiting', 'playing')
    )
  );

CREATE POLICY "Users can join rooms"
  ON public.room_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own membership"
  ON public.room_members FOR UPDATE
  USING (user_id = auth.uid() OR public.is_room_host(room_id));

CREATE POLICY "Users can leave rooms"
  ON public.room_members FOR DELETE
  USING (user_id = auth.uid() OR public.is_room_host(room_id));

-- Game tables
DROP POLICY IF EXISTS "Session readable by members" ON public.game_sessions;
CREATE POLICY "Session readable by members"
  ON public.game_sessions FOR SELECT
  USING (public.is_room_member(room_id) OR public.is_public_room(room_id));

DROP POLICY IF EXISTS "Host can manage sessions" ON public.game_sessions;
CREATE POLICY "Host can manage sessions"
  ON public.game_sessions FOR ALL
  USING (public.is_room_host(room_id));

DROP POLICY IF EXISTS "Rounds readable by members" ON public.rounds;
CREATE POLICY "Rounds readable by members"
  ON public.rounds FOR SELECT
  USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "Host/drawer manage rounds" ON public.rounds;
CREATE POLICY "Host/drawer manage rounds"
  ON public.rounds FOR ALL
  USING (drawer_id = auth.uid() OR public.is_room_host(room_id));

DROP POLICY IF EXISTS "Chat readable by members" ON public.chat_messages;
CREATE POLICY "Chat readable by members"
  ON public.chat_messages FOR SELECT
  USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS "Members can chat" ON public.chat_messages;
CREATE POLICY "Members can chat"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_room_member(room_id));

DROP POLICY IF EXISTS "Drawings readable by members" ON public.drawings;
CREATE POLICY "Drawings readable by members"
  ON public.drawings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rounds r
      WHERE r.id = drawings.round_id AND public.is_room_member(r.room_id)
    )
  );

DROP POLICY IF EXISTS "Strokes readable by members" ON public.drawing_strokes;
CREATE POLICY "Strokes readable by members"
  ON public.drawing_strokes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rounds r
      WHERE r.id = drawing_strokes.round_id AND public.is_room_member(r.room_id)
    )
  );

DROP POLICY IF EXISTS "Guesses readable by members" ON public.guesses;
CREATE POLICY "Guesses readable by members"
  ON public.guesses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.rounds r
      WHERE r.id = guesses.round_id AND public.is_room_member(r.room_id)
    )
  );

DROP POLICY IF EXISTS "Scores readable by members" ON public.scores;
CREATE POLICY "Scores readable by members"
  ON public.scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.game_sessions gs
      WHERE gs.id = scores.session_id AND public.is_room_member(gs.room_id)
    )
  );

GRANT EXECUTE ON FUNCTION public.is_room_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_public_room(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_room_host(UUID) TO authenticated, anon;
