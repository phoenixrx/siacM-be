const z = require('zod')
const localidadSchema = z.object({
    tipo_id: z.coerce.number().min(0).max(9999),
    tipo: z.enum(['mun','par','est','zon'])
  })

  function validateLocalidad(object){
    return localidadSchema.safeParseAsync(object)  
  }
  module.exports = {validateLocalidad}