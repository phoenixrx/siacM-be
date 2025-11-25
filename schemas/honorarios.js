const z = require('zod')
const honorarios_configSchema = z.object({
    id_honorario: z.coerce.number().positive().optional(),
    campo: z.string().optional(),    
    descripcion: z.string().toUpperCase(),
    activo: z.string().min(0).max(1),
    id_cli: z.coerce.number().positive(),
    porcentaje_med: z.coerce.number().min(0).max(1),
    monto_fijo: z.coerce.number().min(0),
    id_moneda: z.coerce.number().positive(),
    descuento_porcent: z.coerce.number().min(0).max(1),
    porcentaje_tec: z.coerce.number().min(0).max(1),
    monto_fijo_tec: z.coerce.number().min(0),
    id_moneda_tec: z.coerce.number().positive()
    })  
    

  function validateHonorariosConfig(object){
    return honorarios_configSchema.safeParseAsync(object)  
  }

  function actualizarHonorariosConfig(object){
      return honorarios_configSchema.partial().safeParseAsync(object)  
    }

  module.exports = {validateHonorariosConfig,actualizarHonorariosConfig}