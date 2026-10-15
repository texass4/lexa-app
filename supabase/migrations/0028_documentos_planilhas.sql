-- Íntegra — planilhas (Excel e CSV) na Central de Documentos.
--
-- Rode no SQL Editor do Supabase depois da 0027. Pode rodar de novo sem erro.
-- ADITIVA: só acrescenta três formatos à lista do bucket `documents` (0023). Nenhum
-- arquivo, tabela ou política muda. A tela aceita os mesmos formatos
-- (`lib/documentos/library.ts` e `lib/documentos/documents.ts`).
--
-- Desfazer: rodar de novo o `update` da 0023 (volta aos seis formatos anteriores).

begin;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  'image/jpeg',
  'image/png'
]
where id = 'documents';

commit;
