const queries = ["SELECT boton FROM planes_det WHERE id_plan=?",
  "SELECT * FROM versiones WHERE (activo='1' AND id_cli=?) OR (activo='1' AND id_cli='0') ORDER BY id_version DESC LIMIT ? OFFSET ?",
  "SELECT COUNT(id_version) AS total FROM versiones WHERE (activo='1' AND id_cli=?) OR (activo='1' AND id_cli='0')",
  "SELECT COUNT(id_admision) as total FROM admisiones WHERE control =? and id_cli=? and activo=1",
  "SELECT id_estudio FROM estudios WHERE descripcion =? and id_cli=?",
  "SELECT m.id_medico, CONCAT(m.nombre, ' ', m.apellido) as medico FROM medicos m INNER JOIN medicos_clinicas mc ON m.id_medico=mc.id_med WHERE mc.id_cli=? AND mc.activo=1",
  "SELECT id_consultorio, descripcion FROM consultorios WHERE activo=1 and id_cli=?",
  "SELECT calendarios.title, calendarios.descripcion, calendarios.start, calendarios.fecha_creacion, pacientes.telef1, pacientes.correo, concat(medicos.nombre, ' ', medicos.apellido)as medicos, medicos.id_medico FROM medicos, calendarios, pacientes WHERE calendarios.id_paciente = pacientes.id_paciente AND calendarios.id_medico = medicos.id_medico AND calendarios.status_ag = 'Esperando' AND calendarios.activo = 1 AND calendarios.id_cli =?;",
  "SELECT * FROM reportes_personalizados WHERE id_cli =?;",
  "SELECT id_empresa,descripcion FROM empresas WHERE id_cli =? and activo=1;",
  "SELECT id_seguro,descripcion FROM seguros WHERE id_cli =? and activo=1;",
  "SELECT id_tipo_interno,descripcion FROM tipos_interno WHERE id_cli =? and activo=1;",
  "SELECT * FROM grupo_estudio WHERE id_cli =? and activo=1;",
  "SELECT * FROM tipo_estudio WHERE id_cli =? and activo=1;",
  "SELECT id_moneda, simbolo, descripcion FROM monedas where id_cli='0' or id_cli =? and activo ='1'",
  "SELECT id_forma_pago, nota, descripcion, credito FROM formas_pago where id_cli in ('0', ?) and activo ='1' and id_moneda IN(0,?) ",
  "SELECT * FROM estudios WHERE id_cli =? and activo=1 and insumo=0;",
  `SELECT pd.boton     FROM perfil_usuario_empresa pue     JOIN planes_det pd ON pue.id_plan = pd.id_plan    WHERE pue.id_usuario_empresa = ?`,
  `SELECT * FROM opt_main WHERE id_cli=?`,  
  `SELECT * FROM canales_atraccion WHERE id_cli=?`,
  "SELECT * FROM estudios WHERE id_cli =? and activo=1 and insumo=1;"  ,
  "SELECT * FROM gastos_metodo_pago where id_cli IN (0, ?) and activo=1;",
  "UPDATE perfil_usuario_basico SET mostrar_news =? WHERE id_usuario = ?;",  
  "SELECT cajas.*, facturas_controles.num_factura, facturas_controles.num_control, facturas_controles.num_recibo, facturas_controles.prefijo_factura, facturas_controles.prefijo_recibo FROM cajas INNER JOIN facturas_controles ON facturas_controles.id_caja=cajas.id where cajas.id_cli IN (0, ?);",
  "SELECT u.usuario, cu.id FROM caja_usuarios cu INNER JOIN usuarios u ON cu.id_usuario = u.id WHERE cu.id_caja=?;",
  "SELECT u.id, u.usuario FROM usuarios u INNER JOIN perfil_usuario_basico pub ON u.id=pub.id_usuario WHERE pub.id_usuario_empresa=? AND u.activo=1;",  
  "SELECT tasa FROM admisiones where id_cli=? ORDER BY id_admision DESC LIMIT 1;",
  "SELECT mostrar_news FROM perfil_usuario_basico WHERE id_usuario=?;", 
  "UPDATE usuarios SET animaciones =? WHERE id=?;" ,
  "SELECT * FROM aps_ocupacional_tipos WHERE id_cli IN (0, ?) and activo=1;",
  "SELECT id_subempresa AS id, descripcion FROM subempresas WHERE activo ='1' and id_empresa=?",  
  "SELECT id_combo_estudio, descripcion FROM combos_estudios where id_cli = ? and activo ='1'",
  "SELECT sum(precio_usd) as precio FROM combos_estudios_det where id_combo = ?",
  "SELECT * FROM grupos_usuarios WHERE id_cli = ? and activo ='1'",
  "SELECT * FROM tipos_interno WHERE id_cli =?",
  "SELECT id_moneda, precio FROM baremo_insumo WHERE id_estudio=? AND id_tarifa=?;",
  "SELECT id_moneda, precio FROM baremo_estudios WHERE id_estudio=? AND id_tarifa=?;",
  "SELECT * FROM seguros WHERE id_cli =? ;",
  "SELECT * FROM empresas WHERE id_cli =? ;",  
  "SELECT * FROM grupo_estudio WHERE id_cli =?;",
  "SELECT * FROM tipo_estudio WHERE id_cli =?;",
  "SELECT * FROM estudios WHERE id_cli=?"
];
/*---------uso alterno desde funciones comunes
let combos = await retornar_opciones(31,0) <--- usar si el filtro unico es id_cli
let animacion = await retornarQueryFiltrada(28, 0, ['s',3]) <---usar con filtro personalizado
*/
/*---------------uso-----------------------------------------------
const response = await fetch(
    "https://pruebas.siac.historiaclinica.org/cargar_query",
    {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filtros: [token_decoded.id_cli], id_query: query,id_contenedor:contenedor }),
    }
);
const opciones = await response.json();       
----------------------------------------------------------------------- */      

let promos_admisiones = `
SELECT 
    ad.*,
    p.descripcion as promo,
    u.usuario    
FROM
    admisiones_descuentos ad
INNER JOIN
    promociones p ON ad.id_promocion = p.id_promocion 
INNER JOIN
    usuarios u ON ad.id_usuario = u.id
WHERE 
    ad.id_admision = ? `;
let cambio_moneda_det = "UPDATE admisiones_det SET id_moneda=? WHERE id_admidet=?";  
let opciones_factura = `SELECT * FROM opt_factura WHERE id_cli=?`;
let opciones_medicos = `SELECT * FROM opt_med_portal WHERE id_cli=?`;
let opciones_notif = `SELECT * FROM opt_notificaciones WHERE id_cli=?`;
let admision_completa = `SELECT admisiones.*,
    admisiones.monto_apro as nota_seguro,
    CONCAT(pacientes.tipo_cedula, '-', pacientes.cedula) AS cedula_paciente,
    CONCAT(pacientes.nombres, ' ', pacientes.apellidos) AS nombre_completo_paciente,
    pacientes.nombres as nombre_plano, 
    pacientes.apellidos as apellido_plano,
    pacientes.telef1,
    pacientes.direccion,
    pacientes.fecha_nacimiento,
    pacientes.correo,
    pacientes.sexo,
    seguros.descripcion AS seguro,
    empresas.descripcion AS empresa,
    tipos_interno.descripcion AS interno,
    zonas.zona,
    CONCAT(titular.tipo_cedula, '-', titular.cedula) AS cedula_titular,
    CONCAT(titular.nombres, ' ', titular.apellidos) AS nombre_completo_titular,
    CONCAT(perfil_usuario_basico.nombre, ' ', perfil_usuario_basico.apellidos) AS usuario,
    estados.estado,
    municipios.municipio,
    parroquias.parroquia
FROM 
    admisiones
INNER JOIN 
    pacientes ON admisiones.id_paciente = pacientes.id_paciente
INNER JOIN 
    perfil_usuario_basico ON admisiones.id_usuario = perfil_usuario_basico.id_usuario
INNER JOIN
    estados ON admisiones.id_estado = estados.id_estado
INNER JOIN
    municipios ON admisiones.id_municipio = municipios.id_municipio
INNER JOIN
    parroquias ON admisiones.id_parroquia = parroquias.id_parroquia
LEFT JOIN 
    seguros ON admisiones.id_seguro = seguros.id_seguro
LEFT JOIN 
    empresas ON admisiones.id_empresa = empresas.id_empresa
LEFT JOIN 
    tipos_interno ON admisiones.id_tipo_interno = tipos_interno.id_tipo_interno
LEFT JOIN 
    pacientes AS titular ON admisiones.id_representante = titular.id_paciente
LEFT JOIN 
    zonas ON admisiones.id_zona = zonas.id_zona
WHERE 
    admisiones.id_admision = ?;`;

let detalles_admision = `SELECT 
		admisiones_det.*,
        consultorios.descripcion as consultorio,
        consultorios.id_consultorio,
        estudios.descripcion as estudio,
        g.descripcion as grupo,
        t.descripcion as tipo,
        concat(medicos.nombre, ' ',medicos.apellido) as medico,
        concat(medicos2.nombre, ' ',medicos2.apellido) as medico2,
        concat(tecnicos.nombre, ' ',tecnicos.apellido) as tecnico
FROM
		admisiones_det
INNER JOIN 
    estudios ON admisiones_det.id_estudio = estudios.id_estudio
INNER JOIN 
    grupo_estudio g ON estudios.id_grupo_estudio = g.id_grupo_estudio
INNER JOIN 
    tipo_estudio t ON estudios.id_tipo_estudio = t.id_tipo_estudio  
INNER JOIN 
    consultorios ON admisiones_det.id_consultorio = consultorios.id_consultorio
INNER JOIN 
    medicos  ON admisiones_det.id_medico = medicos.id_medico
LEFT JOIN 
    medicos as medicos2 ON admisiones_det.id_medico2 = medicos2.id_medico
LEFT JOIN 
    medicos as tecnicos ON admisiones_det.id_tecnico = tecnicos.id_medico
WHERE 
    admisiones_det.id_admision = ?
ORDER BY admisiones_det.id_admidet DESC`;

let admisiones_admidet = 
    `SELECT admisiones.*,
	admisiones_det.id_admision,
    CONCAT(pacientes.tipo_cedula, '-', pacientes.cedula) AS cedula_paciente,
    CONCAT(pacientes.nombres, ' ', pacientes.apellidos) AS nombre_completo_paciente,
    pacientes.telef1,
    pacientes.direccion,
    pacientes.fecha_nacimiento,
    seguros.descripcion AS seguro,
    empresas.descripcion AS empresa,
    tipos_interno.descripcion AS interno,
    estudios.descripcion as estudio,
    concat(medicos.nombre, ' ',medicos.apellido) as medico,
    zonas.zona,
    CONCAT(titular.tipo_cedula, '-', titular.cedula) AS cedula_titular,
    CONCAT(titular.nombres, ' ', titular.apellidos) AS nombre_completo_titular,
    CONCAT(perfil_usuario_basico.nombre, ' ', perfil_usuario_basico.apellidos) AS usuario,
    te.descripcion as tipo_estudio
FROM 
    admisiones
INNER JOIN 
    admisiones_det ON admisiones_det.id_admision = admisiones.id_admision
INNER JOIN 
    pacientes ON admisiones.id_paciente = pacientes.id_paciente
INNER JOIN 
    perfil_usuario_basico ON admisiones.id_usuario = perfil_usuario_basico.id_usuario
INNER JOIN 
    estudios ON admisiones_det.id_estudio = estudios.id_estudio
INNER JOIN 
    medicos  ON admisiones_det.id_medico = medicos.id_medico
LEFT JOIN 
    seguros ON admisiones.id_seguro = seguros.id_seguro
LEFT JOIN 
    empresas ON admisiones.id_empresa = empresas.id_empresa
LEFT JOIN 
    tipos_interno ON admisiones.id_tipo_interno = tipos_interno.id_tipo_interno
LEFT JOIN 
    pacientes AS titular ON admisiones.id_representante = titular.id_paciente
LEFT JOIN 
    zonas ON admisiones.id_zona = zonas.id_zona
LEFT JOIN
    tipo_estudio te ON estudios.id_tipo_estudio = te.id_tipo_estudio
WHERE 
    admisiones.id_cli = ? AND
    admisiones.tipo_consulta IN (?) AND
    admisiones.activo IN (?) AND
    admisiones.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') 
ORDER BY admisiones.fecha_admision DESC 
    LIMIT ? OFFSET ?`;



let cantidad_citas_pendientes =`SELECT count(id_calendario)as total 
    from calendarios 
where 
   calendarios.status_ag = 'Pendiente' AND 
   calendarios.activo = 1 AND 
   calendarios.id_cli =? `;

let honorarios_tecnicos = `
SELECT 
    estudios.descripcion, 
    admisiones_det.cantidad, 
    admisiones_det.precio, 
    admisiones_det.precio_usd, 
    admisiones_det.id_moneda, 
    admisiones_det.cambio, 
    CONCAT(medicos.nombre, ' ', medicos.apellido) AS tecnico,
    grupo_estudio_honorarios.porcentaje_tec,
    grupo_estudio_honorarios.monto_fijo_tec,
    grupo_estudio_honorarios.id_moneda_tec 
FROM 
    admisiones_det, 
    estudios, 
    grupo_estudio_honorarios,
    medicos 
WHERE 
    estudios.id_estudio = admisiones_det.id_estudio and 
    estudios.id_gru_hon = grupo_estudio_honorarios.id_grupo_estudio and
    admisiones_det.id_admidet IN (SELECT 
                                    hon_med_recibo_det1.id_admidet 
                                FROM 
                                    hon_med_recibo_det1
                                WHERE 
                                    hon_med_recibo_det1.id_hon_med_pago = ? and 
                                    hon_med_recibo_det1.id_admidet != 0) and
    medicos.id_medico = admisiones_det.id_medico2 and 
    admisiones_det.id_medico2 >0 and
    admisiones_det.id_medico = ?`;

let relacion_admisiones = `SELECT 
    admisiones_det.precio,
    admisiones_det.precio_usd,
    admisiones_det.activo as activo_det,
    admisiones_det.nota,
    admisiones.orden,
    admisiones.activo,
    admisiones_det.cantidad,
    admisiones_det.id_moneda,
    admisiones_det.cambio,
    admisiones_det.es_insumo,
    admisiones_det.status_honorarios,
    admisiones_det.fecha_detalle,
    admisiones.factura,
    admisiones.control,
    admisiones.clave,
    admisiones.fecha, 
    admisiones.id_cli,
    admisiones.tipo_consulta,
    admisiones.id_estado_admision,
    estudios.descripcion AS estudio,
    CONCAT(medicos.nombre, ' ', medicos.apellido) AS medico,    
    CONCAT(medicos2.nombre, ' ', medicos2.apellido) AS medico2,
    CONCAT(tecnicos.nombre, ' ', tecnicos.apellido) AS tecnico,
    empresas.descripcion AS empresa,
    seguros.descripcion AS seguro,
    tipos_interno.descripcion AS interno,
    CONCAT(pacientes.tipo_cedula, '-', pacientes.cedula) AS cedula_paciente,
    CONCAT(pacientes.nombres, ' ', pacientes.apellidos) AS nombre_paciente,
    admisiones.fecha_admision 
FROM 
    admisiones
INNER JOIN 
    pacientes ON pacientes.id_paciente = admisiones.id_paciente    
LEFT JOIN 
    admisiones_det ON admisiones.id_admision = 
    admisiones_det.id_admision  
INNER JOIN 
    estudios ON admisiones_det.id_estudio = estudios.id_estudio    
LEFT JOIN 
    medicos ON admisiones_det.id_medico = medicos.id_medico    
LEFT JOIN 
    empresas ON admisiones.id_empresa = empresas.id_empresa
LEFT JOIN 
    seguros ON admisiones.id_seguro = seguros.id_seguro
LEFT JOIN 
    tipos_interno ON admisiones.id_tipo_interno = tipos_interno.id_tipo_interno    
LEFT JOIN 
    medicos AS medicos2 ON admisiones_det.id_medico2 = medicos2.id_medico
LEFT JOIN 
    medicos AS tecnicos ON admisiones_det.id_tecnico = tecnicos.id_medico
WHERE 
    admisiones.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') AND 
    admisiones.id_cli =? AND
    admisiones.id_seguro =? AND
    admisiones.id_empresa =? AND
    admisiones.id_tipo_interno =?`;

let relacion_pacientes_medico = `SELECT 
    admisiones_det.precio,
    admisiones_det.precio_usd,
    admisiones_det.activo,
    admisiones_det.nota,
    admisiones_det.cantidad,
    admisiones_det.id_moneda,
    admisiones_det.id_medico,
    admisiones_det.cambio,
    admisiones_det.es_insumo,
    admisiones_det.status_honorarios,
    admisiones_det.fecha_detalle,
    admisiones.factura,
    admisiones.control,
    admisiones.clave as orden,
    admisiones.fecha, 
    admisiones.id_cli,
    admisiones.tipo_consulta,
    admisiones.id_estado_admision,
    estudios.descripcion AS estudio,
    CONCAT(medicos.nombre, ' ', medicos.apellido) AS medico,    
    CONCAT(medicos2.nombre, ' ', medicos2.apellido) AS medico2,
    CONCAT(tecnicos.nombre, ' ', tecnicos.apellido) AS tecnico,
    empresas.descripcion AS empresa,
    seguros.descripcion AS seguro,
    tipos_interno.descripcion AS interno,
    admisiones.tipo_consulta,
    CONCAT(pacientes.tipo_cedula, '-', pacientes.cedula) AS cedula_paciente,
    CONCAT(pacientes.nombres, ' ', pacientes.apellidos) AS nombre_paciente,
    admisiones.fecha_admision 
FROM 
    admisiones
INNER JOIN 
    pacientes ON pacientes.id_paciente = admisiones.id_paciente    
LEFT JOIN 
    admisiones_det ON admisiones.id_admision = 
    admisiones_det.id_admision  
INNER JOIN 
    estudios ON admisiones_det.id_estudio = estudios.id_estudio    
LEFT JOIN 
    medicos ON admisiones_det.id_medico = medicos.id_medico    
LEFT JOIN 
    empresas ON admisiones.id_empresa = empresas.id_empresa
LEFT JOIN 
    seguros ON admisiones.id_seguro = seguros.id_seguro
LEFT JOIN 
    tipos_interno ON admisiones.id_tipo_interno = tipos_interno.id_tipo_interno    
LEFT JOIN 
    medicos AS medicos2 ON admisiones_det.id_medico2 = medicos2.id_medico
LEFT JOIN 
    medicos AS tecnicos ON admisiones_det.id_tecnico = tecnicos.id_medico
WHERE 
    admisiones_det.activo =1 and
    admisiones.activo = 1 and
    admisiones.fecha_admision BETWEEN ? AND CONCAT(?, ' 23:59:59') AND 
    admisiones.id_cli =?`;

let historial_pacientes_portal_medico = `SELECT 
    admisiones_det.id_admidet,
    admisiones_det.activo,
    admisiones_det.nota,
    admisiones_det.id_medico,
    admisiones_det.cambio,
    admisiones_det.es_insumo,
    admisiones_det.fecha_detalle,
    admisiones.fecha, 
    admisiones.id_cli,
    admisiones.tipo_consulta,
    estudios.descripcion AS estudio,
    admisiones_det.id_medico,
    admisiones_det.id_medico2,
    admisiones_det.id_tecnico,
    CONCAT(medicos.nombre, ' ', medicos.apellido) AS medico,    
    CONCAT(medicos2.nombre, ' ', medicos2.apellido) AS medico2,
    CONCAT(tecnicos.nombre, ' ', tecnicos.apellido) AS tecnico,
    empresas.descripcion AS empresa,
    seguros.descripcion AS seguro,
    tipos_interno.descripcion AS interno,
    admisiones.tipo_consulta,
    pacientes.id_paciente,
    CONCAT(pacientes.tipo_cedula, '-', pacientes.cedula) AS cedula_paciente,
    CONCAT(pacientes.nombres, ' ', pacientes.apellidos) AS nombre_paciente,
    admisiones.fecha_admision , 
    consultas.id_consulta,
    consultas.motivo
FROM 
    admisiones
INNER JOIN 
    pacientes ON pacientes.id_paciente = admisiones.id_paciente    
LEFT JOIN 
    admisiones_det ON admisiones.id_admision = 
    admisiones_det.id_admision  
LEFT JOIN 
    consultas ON admisiones_det.id_admidet = 
    consultas.id_admidet  
INNER JOIN 
    estudios ON admisiones_det.id_estudio = estudios.id_estudio    
LEFT JOIN 
    medicos ON admisiones_det.id_medico = medicos.id_medico    
LEFT JOIN 
    empresas ON admisiones.id_empresa = empresas.id_empresa
LEFT JOIN 
    seguros ON admisiones.id_seguro = seguros.id_seguro
LEFT JOIN 
    tipos_interno ON admisiones.id_tipo_interno = tipos_interno.id_tipo_interno    
LEFT JOIN 
    medicos AS medicos2 ON admisiones_det.id_medico2 = medicos2.id_medico
LEFT JOIN 
    medicos AS tecnicos ON admisiones_det.id_tecnico = tecnicos.id_medico
WHERE 
    admisiones.id_paciente =? AND
    admisiones.id_cli =? AND
    (admisiones_det.id_medico =? OR 
    admisiones_det.id_medico2 =? OR
    admisiones_det.id_tecnico =?)`;
 let query_mobile_historial_paciente = `SELECT 
    admisiones_det.id_admidet,
    admisiones_det.activo,
    admisiones_det.nota,
    admisiones_det.id_medico,
    admisiones_det.cambio,
    admisiones_det.es_insumo,
    admisiones_det.fecha_detalle,
    admisiones.fecha, 
    admisiones.id_cli,
    admisiones.tipo_consulta,
    estudios.descripcion AS estudio,
    admisiones_det.id_medico,
    admisiones_det.id_medico2,
    admisiones_det.id_tecnico,
    CONCAT(medicos.nombre, ' ', medicos.apellido) AS medico,    
    CONCAT(medicos2.nombre, ' ', medicos2.apellido) AS medico2,
    CONCAT(tecnicos.nombre, ' ', tecnicos.apellido) AS tecnico,
    empresas.descripcion AS empresa,
    seguros.descripcion AS seguro,
    tipos_interno.descripcion AS interno,
    admisiones.tipo_consulta,
    pacientes.id_paciente,
    CONCAT(pacientes.tipo_cedula, '-', pacientes.cedula) AS cedula_paciente,
    CONCAT(pacientes.nombres, ' ', pacientes.apellidos) AS nombre_paciente,
    admisiones.fecha_admision , 
    consultas.id_consulta,
    consultas.motivo,
    pub.apellidos
FROM 
    admisiones
INNER JOIN 
    pacientes ON pacientes.id_paciente = admisiones.id_paciente    
LEFT JOIN 
    admisiones_det ON admisiones.id_admision = 
    admisiones_det.id_admision  
LEFT JOIN 
    consultas ON admisiones_det.id_admidet = 
    consultas.id_admidet  
INNER JOIN 
    estudios ON admisiones_det.id_estudio = estudios.id_estudio    
INNER JOIN
    perfil_usuario_basico pub ON pub.id_usuario = admisiones.id_cli
LEFT JOIN 
    medicos ON admisiones_det.id_medico = medicos.id_medico    
LEFT JOIN 
    empresas ON admisiones.id_empresa = empresas.id_empresa
LEFT JOIN 
    seguros ON admisiones.id_seguro = seguros.id_seguro
LEFT JOIN 
    tipos_interno ON admisiones.id_tipo_interno = tipos_interno.id_tipo_interno    
LEFT JOIN 
    medicos AS medicos2 ON admisiones_det.id_medico2 = medicos2.id_medico
LEFT JOIN 
    medicos AS tecnicos ON admisiones_det.id_tecnico = tecnicos.id_medico
WHERE 
    admisiones.id_paciente =? AND    
    (admisiones_det.id_medico =? OR 
    admisiones_det.id_medico2 =? OR
    admisiones_det.id_tecnico =?)`;
let query_datos_enfermeria = `SELECT  de.id_admision, 
                                    de.peso, 
                                    de.talla, 
                                    de.presion, 
                                    de.contacto, 
                                    de.trabajo, 
                                    de.plan_trat, 
                                    de.id_datos_enfermeria,
                                    de.pa_diastolica,
                                    de.pa_sistolica,
                                    p.id_paciente    
                                FROM 
                                    datos_enfermeria de
                                INNER JOIN
                                    admisiones a ON a.id_admision = de.id_admision
                                INNER JOIN
                                    pacientes p on p.id_paciente = a.id_paciente
                                WHERE
                                    p.id_paciente = ?

                                `

let limpiar_consulta = `UPDATE 
                                consultas 
                            SET 
                                consulta=NULL,
                                revision_sistema=NULL,
                                ex_fis=NULL,
                                otro_diagnostico=NULL,
                                plan_tto=NULL,
                                recomendaciones=NULL,
                                observaciones=NULL,
                                medicamentos=NULL,
                                indicaciones=NULL,
                                antecedentes=NULL,
                                informe_manual=NULL
                            WHERE id_admidet = ?`;

let hon_med_recibo_det_fp = `SELECT 
    h.paciente, 
    h.cant,
    h.estudio,
    h.monto,            
    h.id_admision,
    h.tipo,
    h.id_admidet,
    CASE 
        WHEN h.monedas IN ('Bs', 'Bolivares') THEN 2
        WHEN h.monedas IN ('$', 'USD', 'Dolares') THEN 1
        ELSE h.monedas
    END AS monedas,  
    cp.nota,
    cp.monto as monto_usd_cp,
    cp.monto_bs as monto_bs_cp,
    cp.id_moneda as moneda_cp,
    cp.nota as nota_cp,
    fp.descripcion AS forma_pago_descripcion,
    e.id_gru_hon,
    admisiones_det.activo as activo_det,
    cp.activo as activo_cp,
    te.descripcion as tipo_estudio,
    geh.*     
FROM
    hon_med_recibo_det1 h
LEFT JOIN
    control_pagos cp ON h.id_admision = cp.id_externa
LEFT JOIN
    formas_pago fp ON cp.id_forma_pago = fp.id_forma_pago
LEFT JOIN
    admisiones_det ON admisiones_det.id_admidet = h.id_admidet
LEFT JOIN
    estudios e ON admisiones_det.id_estudio = e.id_estudio
LEFT JOIN
    grupo_estudio_honorarios geh ON geh.id_grupo_estudio = e.id_gru_hon
LEFT JOIN
    tipo_estudio te ON te.id_tipo_estudio = e.id_tipo_estudio
WHERE
    h.id_hon_med_pago = ?`;
    
let medicos = `SELECT
    m.id_medico,
    CONCAT(m.nombre, ' ', m.apellido) AS medico,
    m.cedula,
    m.cedula_p,
    m.sexo,
    mc.activo,
    mc.duracion,
    mc.id_cli, 
    mc.id_consultorio,
    mc.max_seguro,
    mc.foto,
    mc.telef_informe,
    mc.telef_recp
  FROM
    medicos m
  LEFT JOIN
    medicos_clinicas mc ON m.id_medico=mc.id_med
  WHERE 
    mc.id_cli=? AND
    mc.activo=1`;

let medico_especialidad = `SELECT 
        m.id_medico, 
        e.descripcion, 
        ea.descripcion as grupo 
    FROM medicos m 
    INNER JOIN med_esp me ON me.id_medico=m.id_medico 
    INNER JOIN especialidades e ON e.id_especialidad=me.id_especialidad 
    LEFT JOIN especialidades_grupos eg ON eg.id_especialidad=e.id_especialidad 
    LEFT JOIN especialidades_agrupadas ea ON ea.id=eg.id_grupo 
    WHERE m.id_medico=?`;    

let med_portal_odontol_proc = `SELECT 
    opp.id, 
    a.id_admision, 
    ad.id_admidet 
FROM 
    odontol_pieces_procedures opp 
INNER JOIN admisiones_det ad on ad.id_admidet=opp.id_admidet 
INNER JOIN admisiones a ON a.id_admision=ad.id_admision 
WHERE opp.id_paciente=? 
LIMIT 1`;

let query_contenedor_reportes =`
SELECT
    a.id_paciente,
    ad.id_admision,
    ad.id_medico
FROM
    admisiones_det ad
INNER JOIN 
    admisiones a ON a.id_admision=ad.id_admision
WHERE ad.id_admidet=?
`

const portal_med = [
    historial_pacientes_portal_medico, 
    limpiar_consulta, 
    medicos, 
    query_mobile_historial_paciente, 
    medico_especialidad, 
    med_portal_odontol_proc, 
    query_datos_enfermeria,
    query_contenedor_reportes
]

let motivos_cierre_admision = `SELECT id, descripcion from admisiones_cierres_tipo where id_cli IN (?, 0) and activo =1 and id>3`
let get_estado_admision = "SELECT id_status_cierre, id_usuario_cierre, fecha_cierre,motivo_cierre FROM admisiones WHERE id_admision=?"


const queries_agenda = [
    cantidad_citas_pendientes
]

const queries_admisiones = [
  admision_completa,
  detalles_admision,
  relacion_admisiones,
  relacion_pacientes_medico,
  admisiones_admidet,
  motivos_cierre_admision,
  promos_admisiones,
  get_estado_admision, 
  cambio_moneda_det
]

const opciones_admision = `SELECT * FROM opt_admisiones WHERE id_cli=?`
const opciones_aps = `SELECT * FROM opt_aps WHERE id_cli=?`

const queries_opciones = [
    opciones_factura, opciones_medicos, opciones_admision, opciones_aps, opciones_notif
]

const queries_honorarios = [
    honorarios_tecnicos, hon_med_recibo_det_fp
]

let movimientos_inventarios =`SELECT 
    almacen_movimientos.id_movimiento_almacen,
    almacen_movimientos.id_insumo,
    almacen_movimientos.cantidad,
    almacen_movimientos.descripcion,
    almacen_movimientos.fecha_creacion,    
    estudios.descripcion as insumo,
    grupo_estudio.descripcion as grupo,
    consultorios.descripcion as almacen,
    usuarios.usuario
from    
    almacen_movimientos,  
    estudios, 
    grupo_estudio,
    consultorios,
    usuarios
WHERE 
    almacen_movimientos.id_responsable=usuarios.id and
    consultorios.id_consultorio=almacen_movimientos.id_almacen and
    estudios.id_estudio=almacen_movimientos.id_insumo AND
    grupo_estudio.id_grupo_estudio=estudios.id_grupo_estudio and
    estudios.id_cli=? AND
    almacen_movimientos.fecha_creacion BETWEEN ? AND CONCAT(?, ' 23:59:59') 
ORDER BY
   almacen_movimientos.id_movimiento_almacen, grupo, estudios.descripcion desc, almacen_movimientos.fecha_creacion desc`;


    let  ventas_insumos =`
      SELECT 
            e.id_estudio,
            e.descripcion AS estudio, 
            e.id_grupo_estudio,
            g.descripcion AS grupo_estudio,
            SUM(d.cantidad) AS total_cantidad
        FROM admisiones_det d
        INNER JOIN admisiones a ON d.id_admision = a.id_admision
        INNER JOIN estudios e ON d.id_estudio = e.id_estudio
        INNER JOIN grupo_estudio g ON e.id_grupo_estudio = g.id_grupo_estudio
        WHERE 
            e.insumo = 1 
            AND a.id_cli = ?
            AND a.activo = 1
            AND d.activo = 1            
            AND DATE(d.fecha_detalle) BETWEEN ? AND ?
        GROUP BY 
            e.id_estudio,
            e.descripcion,
            e.id_grupo_estudio,
            g.descripcion
        ORDER BY 
            g.descripcion,
            e.descripcion;
    `;
    let opciones_inventarios = `SELECT 
                              consultorios.id_consultorio as ID, 
                              consultorios.descripcion as Almacen
                            FROM consultorios
                            WHERE consultorios.descripcion IN ('PRINCIPAL', 'DEVOLUCIONES', 'RESERVA')
                                and consultorios.id_cli= ?`
const queries_inventarios = [
    movimientos_inventarios, ventas_insumos, opciones_inventarios
]
const contenedor_query =[queries, queries_admisiones, queries_agenda, 
    queries_opciones, queries_honorarios, portal_med, queries_inventarios]
module.exports = contenedor_query;
