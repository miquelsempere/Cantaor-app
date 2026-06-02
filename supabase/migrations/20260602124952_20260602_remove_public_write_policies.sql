/*
  # Eliminar politicas publicas de escritura sobrantes

  Habia politicas que permitian a usuarios no autenticados hacer INSERT, UPDATE y DELETE.
  Esto es un riesgo de seguridad ya que cualquiera podria modificar o borrar pistas.
  Se eliminan para que solo los usuarios autenticados puedan escribir.
*/

DROP POLICY IF EXISTS "Public can delete cante tracks" ON cante_tracks;
DROP POLICY IF EXISTS "Public can insert cante tracks" ON cante_tracks;
DROP POLICY IF EXISTS "Public can update cante tracks" ON cante_tracks;
