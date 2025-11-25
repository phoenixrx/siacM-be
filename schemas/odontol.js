const z = require('zod')
const odontolProcedureSchema = z.object({
  id: z.coerce.number().int().min(0).max(999999).optional(),
  id_admision: z.coerce.number().int(1).min(999).max(999999),
  id_paciente: z.coerce.number().int(1).min(1).max(999999),
  pieza: z.coerce.number().int().min(11).max(100),
  procedimiento: z.coerce.number().int().min(1).max(99),
  caras: z.array(z.coerce.number().positive().min(1).max(100)).min(1),  
  evaluador: z.coerce.number().int().min(1).max(999),
  realizador: z.coerce.number().int().min(1).max(999),
  notas: z.string().max(500).optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Invalid date fecha",
  }),  
  estado: z.coerce.number().int().min(0).max(1),  
  })

  function registrarOdontolProcedure(object){
    return odontolProcedureSchema.safeParseAsync(object)  
  }
  function actualizarOdontolProcedure(object){    
    return odontolProcedureSchema.partial().safeParseAsync(object)  
    }
  module.exports = {registrarOdontolProcedure, actualizarOdontolProcedure}