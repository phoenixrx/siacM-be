const z = require('zod')
const admisionSchema = z.object({
  id_paciente: z.coerce.number().int().min(0).max(999999),
  id_seguro: z.coerce.number().int().min(0).max(999),
  id_empresa: z.coerce.number().int().min(0).max(999),
  id_tipo_interno: z.coerce.number().int().min(0).max(999),
  tipo_consulta: z.enum(['P','S','E','I']),
  id_estado: z.coerce.number().int().min(0).max(999),
  id_municipio: z.coerce.number().int().min(0).max(9999),
  id_parroquia: z.coerce.number().int().min(0).max(9999),
  id_zona: z.coerce.number().int().min(0).max(999).optional(),
  edad: z.string().min(6).max(8),
  nota: z.string().max(200).optional(),
  fecha_admision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Invalid date fecha_admision",
  }),
  fechafactura:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/,{
    message: "Invalid date fechafactura",
    }).optional(),
  fecha_cierre:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/,{
    message: "Invalid date fecha_cierre",
    }).optional(),
  tasa: z.coerce.number().positive(),
  id_usuario_cierre: z.coerce.number().int().min(1).max(999).optional(),
  id_usuario: z.coerce.number().int().min(1).max(999),
  id_cli: z.coerce.number().int().min(1).max(999),
  id_representante: z.coerce.number().int().min(0).max(99999),
  factura: z.string().max(11).optional(),
  motivo_cierre: z.string().max(25).optional(),
  id_subempresa: z.coerce.number().int().min(0).max(999),
  id_status_cierre: z.coerce.number().int().min(1).max(5),
  control: z.string().max(25).optional(),
  diagnostico: z.string().max(250).optional(),
  campo: z.string().max(250).optional(),
  id_admision: z.coerce.number().int().min(0).optional(),
  id_preadmision: z.coerce.number().int().min(0).optional(),
  id_canal_atraccion: z.coerce.number().int().min(0).optional(),
  solo_ppto: z.coerce.number().int().min(0).max(1).optional(),
  clave: z.string().max(50).optional(),
  orden: z.string().max(50).optional(),
  ncontrolsEG: z.string().max(50).optional(),

  })
const detalleSchema = z.object({
  id_admision: z.coerce.number().int().min(0).max(999999),
  id_consultorio: z.coerce.number().int().min(0).max(999),
  id_medico: z.coerce.number().int().min(0).max(999),
  id_estudio: z.coerce.number().int().min(0).max(9999),
  precio: z.coerce.number().min(0),
  precio_usd: z.coerce.number().min(0),
  cantidad: z.coerce.number().int().min(0).max(9999),
  id_moneda: z.coerce.number().int().min(0).max(10).default(1),
  id_tecnico: z.coerce.number().int().min(0).max(999).optional(),
  id_medico2: z.coerce.number().int().min(0).max(999).optional(),
  nota: z.string().max(50).optional(),
  cambio: z.coerce.number().positive(),
  id_usuario: z.coerce.number().int().min(1).max(999),
  activo: z.coerce.number().int().min(0).max(1).optional(), 
  })
  function registrarAdmision(object){
    return admisionSchema.safeParseAsync(object)  
  }
  function registrarDetalleAdmision(object){
    return detalleSchema.safeParseAsync(object)  
  }
  function actualizarAdmision(object){    
      return admisionSchema.partial().safeParseAsync(object)  
    }
  function actualizarAdmisionDet(object){    
      return detalleSchema.partial().safeParseAsync(object)  
    }
  module.exports = {registrarAdmision, registrarDetalleAdmision, actualizarAdmision, actualizarAdmisionDet}