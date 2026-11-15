# Modo en línea (opcional): "me gusta" globales y buscador de jugadores

GitHub Pages solo sirve archivos estáticos: no puede guardar datos de los jugadores. Por eso, sin
configurar nada, Funkade funciona en **modo local**:

- Los «me gusta» se guardan en el perfil (en este navegador) y el contador suma los perfiles de este navegador.
- El buscador de **Jugadores** encuentra los perfiles creados en este navegador.

Para que los «me gusta» se sumen entre **todos** los jugadores y el buscador encuentre a cualquiera, hace
falta una base de datos. Funkade está preparado para [Supabase](https://supabase.com) (plan gratuito).

## 1. Crear el proyecto

1. Crea un proyecto en Supabase.
2. En **Authentication → Sign In / Providers**, activa **Allow anonymous sign-ins** (cada navegador recibe
   una cuenta anónima; no se piden correos ni contraseñas).
3. En **SQL Editor**, ejecuta:

```sql
create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  avatar text default '' check (char_length(avatar) <= 60000),
  bio text default '' check (char_length(bio) <= 200),
  theme int default 0, level int default 1, score bigint default 0,
  clears int default 0, achievements int default 0,
  updated_at timestamptz default now()
);
create table public.song_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_key text not null check (char_length(song_key) <= 200),
  created_at timestamptz default now(),
  primary key (user_id, song_key)
);
create view public.song_like_counts as
  select song_key, count(*)::int as likes from public.song_likes group by song_key;

alter table public.players enable row level security;
alter table public.song_likes enable row level security;
create policy "perfiles visibles" on public.players for select using (true);
create policy "editar mi perfil" on public.players for insert with check (auth.uid() = id);
create policy "actualizar mi perfil" on public.players for update using (auth.uid() = id);
create policy "likes visibles" on public.song_likes for select using (true);
create policy "dar like" on public.song_likes for insert with check (auth.uid() = user_id);
create policy "quitar like" on public.song_likes for delete using (auth.uid() = user_id);
grant select on public.song_like_counts to anon, authenticated;
create index on public.players (score desc);
create index players_name_idx on public.players using gin (to_tsvector('simple', name));
```

## 2. Conectar la web

En **Project Settings → API** copia la *Project URL* y la clave **anon public** y escríbelas en
`public/online.json`:

```json
{ "supabaseUrl": "https://xxxxxxxx.supabase.co", "supabaseAnonKey": "eyJhbGciOi..." }
```

La clave *anon* es pública por diseño (las políticas de arriba son las que protegen los datos). **Nunca**
pongas la clave `service_role`. Haz commit y push: el despliegue la publica y la web pasa a modo en línea.

## Qué se publica

Solo el nombre, avatar, descripción, tema, nivel, puntos, canciones completadas y número de logros del
perfil activo, y los «me gusta». Las partidas con bot no cuentan. Si el servidor no responde, la web sigue
funcionando en modo local.
