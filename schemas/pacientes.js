const z = require('zod')
const pacieteCedSchema = z.object({
    tipo_cedula: z.enum(['V','E','P','J','G','M']).default('V'),
    cedula: z.string({
      required_error: 'Se requiere la cedula',
      invalid_type_error: 'La cedula no es valida'
    }) 
  })
  const pacieteSchema = z.object({
    id_paciente: z.number().positive().optional(),
    campo: z.string().optional(),    
    tipo_cedula: z.enum(['V','E','P','J','G','M']).default('V'),
    cedula: z.string().regex(/^\d{5,10}(-\d)?$/, {      message: "Formato inválido de cedula"    }),
        nombres: z.string({
      required_error: "El campo 'nombres' es obligatorio", 
      invalid_type_error: "Debe ser un texto"
    }).min(1,{
      message: "El campo 'nombres' es obligatorio"  
    }).toUpperCase(),
    apellidos: z.string({
      required_error: "El campo 'apellido' es obligatorio", 
      invalid_type_error: "Debe ser un texto" 
    }).min(1,{
      message: "El campo 'apellido' es obligatorio"  
    }).toUpperCase(),
    telef1: z.string({
      required_error: "El campo 'telefono' es obligatorio", 
      invalid_type_error: "Debe ser un texto" 
    }).min(10,{
      message: "El campo 'telefono' no tiene un formato valido"  
    }),
    fecha_nacimiento: z.string().date(),
    sexo:z.enum(['M','F']).default('M'),
    correo: z.string().email(),
    direccion: z.string().max(300),
    id_paciente: z.coerce.number().positive().optional(),
    
  })


  function validatePatientCed(object){
    return pacieteCedSchema.safeParseAsync(object)  
  }
  function crearPaciente(object){
    return pacieteSchema.safeParseAsync(object)  
  }
  function actualizarPaciente(object){
    return pacieteSchema.partial().safeParseAsync(object)  
  }
  module.exports = {validatePatientCed, crearPaciente,actualizarPaciente}