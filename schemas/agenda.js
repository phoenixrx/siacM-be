const z = require('zod')
const agendarSchema = z.object({
  fecha_fin: z.string({
    required_error: "La fecha de fin es obligatoria",
    invalid_type_error: "La fecha de fin debe ser una cadena"
  }).transform((val) => new Date(val), {
    message: "La fecha de fin no es válida",
  }),
  fecha_inicio: z.string({
    required_error: "La fecha de inicio es obligatoria",
    invalid_type_error: "La fecha de inicio debe ser una cadena"
  }).transform((val) => new Date(val), {
    message: "La fecha de inicio no es válida",
  }),
  id_paciente: z.coerce.number({
    required_error: "El ID del paciente es obligatorio",
    invalid_type_error: "El ID del paciente debe ser un número"
  }).positive("El ID del paciente debe ser un número positivo"),
  title: z.string({
    required_error: "El título es obligatorio",
    invalid_type_error: "El título debe ser una cadena"
  }),
  nota: z.string({
    required_error: "La nota es obligatoria",
    invalid_type_error: "La nota debe ser una cadena"
  }),
  id_med: z.coerce.number({
    required_error: "El ID del médico es obligatorio",
    invalid_type_error: "El ID del médico debe ser un número"
  }).positive("El ID del médico debe ser un número positivo"),
  id_cli: z.string({
    required_error: "El ID del cliente es obligatorio",
    invalid_type_error: "El ID del cliente debe ser una cadena"
  }).toLowerCase()
})

  function registrarCita(object){
    return agendarSchema.safeParseAsync(object)  
  }
  module.exports = {registrarCita}