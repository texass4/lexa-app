/**
 * Instância do serviço de consulta usada pelas rotas. Somente servidor.
 *
 * Trocar a fonte de dados processuais = trocar o `provider` abaixo.
 */

import { datajudProvider } from "@/lib/integrations/legal/datajud/provider"
import { createLookupService } from "./lookup-service"

export const processLookup = createLookupService({ provider: datajudProvider })
