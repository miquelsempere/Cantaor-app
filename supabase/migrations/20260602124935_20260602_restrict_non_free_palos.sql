/*
  # Restringir acceso por palo: Tangos gratis, resto solo autenticados

  ## Cambios

  ### Politicas modificadas en `cante_tracks`
  - Se elimina la politica de lectura publica total
  - Se añaden dos politicas de SELECT mas restrictivas:
    1. Cualquiera puede leer pistas del palo "Tangos" (acceso libre)
    2. Solo usuarios autenticados pueden leer pistas de cualquier otro palo

  ### Motivacion
  El modelo de negocio permite practicar Tangos de forma gratuita.
  El resto de palos requiere registro para incentivar a los usuarios a crear una cuenta.
  La restriccion se aplica tanto en el frontend (modal de auth) como en la base de datos (RLS),
  de forma que no sea bypasseable via peticiones directas a la API.

  ### Notas
  - Las politicas de INSERT, UPDATE y DELETE para usuarios autenticados no cambian.
  - El palo libre se comprueba con igualdad exacta a 'Tangos' (sensible a mayusculas).
*/

-- Eliminar la politica de lectura publica anterior
DROP POLICY IF EXISTS "Anyone can read cante tracks" ON cante_tracks;

-- Politica 1: Cualquiera puede leer pistas de Tangos
CREATE POLICY "Public can read Tangos tracks"
  ON cante_tracks
  FOR SELECT
  TO public
  USING (palo = 'Tangos');

-- Politica 2: Usuarios autenticados pueden leer cualquier pista
CREATE POLICY "Authenticated users can read all tracks"
  ON cante_tracks
  FOR SELECT
  TO authenticated
  USING (true);
