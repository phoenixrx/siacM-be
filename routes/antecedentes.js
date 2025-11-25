// routes/antecedentes.js
const express = require('express');
const router = express.Router();
const { retornarQuery } = require('../auth');
const { authenticateToken, registrarErrorPeticion } = require('../middlewares/autenticarToken');

router.get('/consulta/:id_admidet', async (req, res) => {
    const { id_admidet } = req.params;
    if (!id_admidet) {
        return res.json({ error: "Falta identificador" });
    }

     const checkQuery = `SELECT id_consulta FROM consultas WHERE id_admidet = ? limit 1`;
    
    try {
        const existingRecord = await retornarQuery(checkQuery, [id_admidet]);

        let query=`
        SELECT a.id_admision,
            a.id_paciente,
            p.nombres,
            p.apellidos,
            p.fecha_nacimiento,
            p.sexo,
            p.telef1 as telefono,
            p.correo,            
            de.contacto,
            de.trabajo,
            de.peso,
            de.talla,
            de.presion
        FROM admisiones a
        INNER JOIN pacientes p ON a.id_paciente = p.id_paciente
        INNER JOIN admisiones_det ad ON a.id_admision = ad.id_admision
        LEFT JOIN datos_enfermeria de ON a.id_admision = de.id_admision
        WHERE ad.id_admidet = ?`;
        let params;
        
        let datosIdentificacion = await retornarQuery(query, [id_admidet])

        if (existingRecord.data.length > 0) {
            let queryContador= `SELECT c.id_admidet as id_consulta, a.id_cli 
            FROM consultas c 
            INNER JOIN admisiones_det ad ON c.id_admidet = ad.id_admidet  
            INNER JOIN admisiones a ON ad.id_admision = a.id_admision              
            WHERE a.id_paciente=?`
            let datosContador = await retornarQuery(queryContador, [ datosIdentificacion.data[0].id_paciente])
            return res.json({
                success: true,
                idConsulta: existingRecord.data[0].id_consulta,
                datosIdentificacion,
                datosContador            
            });
        } else {
            const insertingRecord = await retornarQuery(`INSERT INTO consultas (id_admidet) VALUES (?)`, [id_admidet]);
            let queryContador= `SELECT c.id_admidetas id_consulta, a.id_cli 
            FROM consultas c 
            INNER JOIN admisiones_det ad ON c.id_admidet = ad.id_admidet  
            INNER JOIN admisiones a ON ad.id_admision = a.id_admision              
            WHERE a.id_paciente=?`
            let datosContador = await retornarQuery(queryContador, [ datosIdentificacion.data[0].id_paciente])
            return res.json({
                success: true,
                idConsulta: insertingRecord.data.insertId ,
                datosIdentificacion,
                datosContador          
            });
        }
    }catch(error) {
        return res.json({
            success: false,
            error: error.message
        });
    }
})

router.patch('/paciente/:id_paciente', async (req, res) => {
    const { id_paciente } = req.params;
    const updateFields = req.body;

    if (!id_paciente || Object.keys(updateFields).length === 0) {
        return res.json({ error: "Faltan datos" });
    }

    delete updateFields.id_paciente;
    delete updateFields.fecha_creacion;

    const setClause = Object.keys(updateFields)
        .map(key => `${key} = ?`)
        .join(', ');
    
    const values = [...Object.values(updateFields), id_paciente];

    const query = `
        UPDATE pacientes 
        SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE id_paciente = ?
    `;

    try {
        const result = await retornarQuery(query, values);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Registro actualizado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

router.post('/datos_enfermeria/:id_admision', async (req, res) => {
    const { id_admision } = req.params;
    const updateFields = req.body;

    if (!id_admision ) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    const checkQuery = `SELECT id_datos_enfermeria FROM datos_enfermeria WHERE id_admision = ?`;
    
    try {
        const existingRecord = await retornarQuery(checkQuery, [id_admision]);

        let query;
        let params;
        
        if (existingRecord.data.length > 0) {
           
            const setClause = Object.keys(updateFields)
            .map(key => `${key} = ?`)
            .join(', ');
        
            const values = Object.values(updateFields)
            .join(', ');
        
        
            query = `
                UPDATE datos_enfermeria 
                SET ${setClause}
                WHERE id_admision = ?
            `;
            params = [
                    values,
                    id_admision
                    ];
                    
        } else {
            // INSERT
            const setClause = Object.keys(updateFields)
            .map(key => `${key}`)
            .join(', ');
        
            const values = Object.values(updateFields)
            .join(', ');
        


            query = `
                INSERT INTO datos_enfermeria 
                (id_admision, ${setClause})
                VALUES (?, ?)
            `;
            params = [
                id_admision, values
            ];
        }
             
        const result = await retornarQuery(query, params);
        
        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: existingRecord.data.length > 0 ? "Registro actualizado correctamente" : "Registro creado correctamente",
            result: result
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// GET Antecedentes Personales Patológicos por id_consulta
router.get('/personales-patologicos/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    const query = `
        SELECT * FROM antecedentes_personales_patologicos 
        WHERE id_consulta = ?
        ORDER BY fecha_creacion DESC
        LIMIT 1
    `;

    try {
        const result = await retornarQuery(query, [id_consulta]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            result: result.data.length > 0 ? result.data[0] : null
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// GET Antecedentes Ginecológicos por id_consulta
router.get('/ginecologicos/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    const query = `
        SELECT * FROM antecedentes_ginecologicos 
        WHERE id_consulta = ?
        ORDER BY fecha_creacion DESC
        LIMIT 1
    `;

    try {
        const result = await retornarQuery(query, [id_consulta]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            result: result.data.length > 0 ? result.data[0] : null
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// GET Hábitos y Estilo de Vida por id_consulta
router.get('/habitos-estilo-vida/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    const query = `
        SELECT * FROM habitos_estilo_vida 
        WHERE id_consulta = ?
        ORDER BY fecha_creacion DESC
        LIMIT 1
    `;

    try {
        const result = await retornarQuery(query, [id_consulta]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            result: result.data.length > 0 ? result.data[0] : null
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// GET Antecedentes Familiares por id_consulta
router.get('/familiares/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    const query = `
        SELECT * FROM antecedentes_familiares 
        WHERE id_consulta = ?
        ORDER BY fecha_creacion DESC
        LIMIT 1
    `;

    try {
        const result = await retornarQuery(query, [id_consulta]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            result: result.data.length > 0 ? result.data[0] : null
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// GET Historia Enfermedad Actual por id_consulta
router.get('/enfermedad-actual/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    const query = `
        SELECT * FROM historia_enfermedad_actual 
        WHERE id_consulta = ?
        ORDER BY fecha_creacion DESC
        LIMIT 1
    `;

    try {
        const result = await retornarQuery(query, [id_consulta]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            result: result.data.length > 0 ? result.data[0] : null
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// GET Farmacológico Actual por id_consulta
router.get('/farmacologico-actual/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    const query = `
        SELECT * FROM farmacologico_actual 
        WHERE id_consulta = ?
        ORDER BY fecha_creacion DESC
        LIMIT 1
    `;

    try {
        const result = await retornarQuery(query, [id_consulta]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            result: result.data.length > 0 ? result.data[0] : null
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
}); 

// GET Aspectos Psicosociales por id_consulta
router.get('/psicosociales/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    const query = `
        SELECT * FROM aspectos_psicosociales 
        WHERE id_consulta = ?
        ORDER BY fecha_creacion DESC
        LIMIT 1
    `;

    try {
        const result = await retornarQuery(query, [id_consulta]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            result: result.data.length > 0 ? result.data[0] : null
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// GET Todos los antecedentes por id_consulta (endpoint consolidado)
router.get('/todos/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    try {
        // Ejecutar todas las consultas en paralelo
        const [
            personalesPatologicos,
            ginecologicos,
            habitosEstiloVida,
            familiares,
            enfermedadActual,
            farmacologicoActual,
            psicosociales
        ] = await Promise.all([
            retornarQuery('SELECT * FROM antecedentes_personales_patologicos WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM antecedentes_ginecologicos WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM habitos_estilo_vida WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM antecedentes_familiares WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM historia_enfermedad_actual WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM farmacologico_actual WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM aspectos_psicosociales WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta])
        ]);

        // Verificar si hay errores en alguna consulta
        const queries = [personalesPatologicos, ginecologicos, habitosEstiloVida, familiares, enfermedadActual, farmacologicoActual, psicosociales];
        const hasError = queries.some(query => query.error);
        
        if (hasError) {
            return res.json({
                success: false,
                error: "Error en una o más consultas"
            });
        }

        return res.json({
            success: true,
            result: {
                personalesPatologicos: personalesPatologicos.length > 0 ? personalesPatologicos[0] : null,
                ginecologicos: ginecologicos.length > 0 ? ginecologicos[0] : null,
                habitosEstiloVida: habitosEstiloVida.length > 0 ? habitosEstiloVida[0] : null,
                familiares: familiares.length > 0 ? familiares[0] : null,
                enfermedadActual: enfermedadActual.length > 0 ? enfermedadActual[0] : null,
                farmacologicoActual: farmacologicoActual.length > 0 ? farmacologicoActual[0] : null,
                psicosociales: psicosociales.length > 0 ? psicosociales[0] : null
            }
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// POST para guardar/actualizar Antecedentes Personales Patológicos
router.post('/personales-patologicos', async (req, res) => {
    const {
        id_consulta,
        id_paciente,
        enfermedades_cronicas,
        antecedentes_quirurgicos,
        antecedentes_hospitalizaciones,
        alergias_medicamentos,
        alergias_alimentos,
        alergias_otras,
        traumatismos_accidentes,
        problemas_anestesia,
        observaciones, 
        otras_enfermedades
    } = req.body;

    if (!id_consulta || !id_paciente) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    const checkQuery = `SELECT id FROM antecedentes_personales_patologicos WHERE id_consulta = ?`;
    
    try {
        const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

        let query;
        let params;

        if (existingRecord.data.length > 0) {
            // UPDATE
            query = `
                UPDATE antecedentes_personales_patologicos 
                SET enfermedades_cronicas = ?, antecedentes_quirurgicos = ?, antecedentes_hospitalizaciones = ?,
                    alergias_medicamentos = ?, alergias_alimentos = ?, alergias_otras = ?,
                    traumatismos_accidentes = ?, problemas_anestesia = ?, observaciones = ?, otras_enfermedades=?,
                    fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id_consulta = ?
            `;
            params = [
                enfermedades_cronicas, antecedentes_quirurgicos, antecedentes_hospitalizaciones,
                alergias_medicamentos, alergias_alimentos, alergias_otras,
                traumatismos_accidentes, problemas_anestesia, observaciones, otras_enfermedades,
                id_consulta
            ];
        } else {
            // INSERT
            query = `
                INSERT INTO antecedentes_personales_patologicos 
                (id_consulta, id_paciente, enfermedades_cronicas, antecedentes_quirurgicos, 
                 antecedentes_hospitalizaciones, alergias_medicamentos, alergias_alimentos, 
                 alergias_otras, traumatismos_accidentes, problemas_anestesia, observaciones, otras_enfermedades)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            params = [
                id_consulta, id_paciente, enfermedades_cronicas, antecedentes_quirurgicos,
                antecedentes_hospitalizaciones, alergias_medicamentos, alergias_alimentos,
                alergias_otras, traumatismos_accidentes, problemas_anestesia, observaciones,otras_enfermedades
            ];
        }

        const result = await retornarQuery(query, params);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: existingRecord.data.length > 0 ? "Registro actualizado correctamente" : "Registro creado correctamente",
            result: result
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// POST para guardar/actualizar Antecedentes Ginecológicos
router.post('/ginecologicos', async (req, res) => {
    const {
        id_consulta,
        id_paciente,
        menarquia,
        ciclo_menstrual_regular,
        frecuencia_ciclo,
        duracion_ciclo,
        dismenorrea,
        fum,
        menopausia,
        edad_menopausia,
        sintomas_menopausia,
        num_embarazos,
        num_partos,
        num_cesareas,
        num_abortos,
        num_hijos_vivos,
        complicaciones_embarazo,
        metodo_anticonceptivo,
        fecha_ultimo_papanicolaou,
        resultado_papanicolaou,
        fecha_ultima_mamografia,
        resultado_mamografia,
        observaciones
    } = req.body;

    if (!id_consulta || !id_paciente) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    const checkQuery = `SELECT id FROM antecedentes_ginecologicos WHERE id_consulta = ?`;
    
    try {
        const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

        let query;
        let params;

        if (existingRecord.data.length > 0) {
            // UPDATE
            query = `
                UPDATE antecedentes_ginecologicos 
                SET menarquia = ?, ciclo_menstrual_regular = ?, frecuencia_ciclo = ?,
                    duracion_ciclo = ?, dismenorrea = ?, fum = ?, menopausia = ?,
                    edad_menopausia = ?, sintomas_menopausia = ?, num_embarazos = ?,
                    num_partos = ?, num_cesareas = ?, num_abortos = ?, num_hijos_vivos = ?,
                    complicaciones_embarazo = ?, metodo_anticonceptivo = ?, fecha_ultimo_papanicolaou = ?,
                    resultado_papanicolaou = ?, fecha_ultima_mamografia = ?, resultado_mamografia = ?,
                    observaciones = ?, fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id_consulta = ?
            `;
            params = [
                menarquia, ciclo_menstrual_regular, frecuencia_ciclo,
                duracion_ciclo, dismenorrea, fum, menopausia,
                edad_menopausia, sintomas_menopausia, num_embarazos,
                num_partos, num_cesareas, num_abortos, num_hijos_vivos,
                complicaciones_embarazo, metodo_anticonceptivo, fecha_ultimo_papanicolaou,
                resultado_papanicolaou, fecha_ultima_mamografia, resultado_mamografia,
                observaciones, id_consulta
            ];
        } else {
            // INSERT
            query = `
                INSERT INTO antecedentes_ginecologicos 
                (id_consulta, id_paciente, menarquia, ciclo_menstrual_regular, frecuencia_ciclo,
                 duracion_ciclo, dismenorrea, fum, menopausia, edad_menopausia, sintomas_menopausia,
                 num_embarazos, num_partos, num_cesareas, num_abortos, num_hijos_vivos,
                 complicaciones_embarazo, metodo_anticonceptivo, fecha_ultimo_papanicolaou,
                 resultado_papanicolaou, fecha_ultima_mamografia, resultado_mamografia, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            params = [
                id_consulta, id_paciente, menarquia, ciclo_menstrual_regular, frecuencia_ciclo,
                duracion_ciclo, dismenorrea, fum, menopausia, edad_menopausia, sintomas_menopausia,
                num_embarazos, num_partos, num_cesareas, num_abortos, num_hijos_vivos,
                complicaciones_embarazo, metodo_anticonceptivo, fecha_ultimo_papanicolaou,
                resultado_papanicolaou, fecha_ultima_mamografia, resultado_mamografia, observaciones
            ];
        }

        const result = await retornarQuery(query, params);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: existingRecord.data.length > 0 ? "Registro actualizado correctamente" : "Registro creado correctamente",
            result: result
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// POST para guardar/actualizar Hábitos y Estilo de Vida
router.post('/habitos-estilo-vida', async (req, res) => {
    const {
        id_consulta,
        id_paciente,
        dieta_descripcion,
        consumo_agua_diario,
        actividad_fisica,
        tipo_actividad_fisica,
        frecuencia_actividad_fisica,
        duracion_actividad_fisica,
        horas_sueno_diarias,
        calidad_sueno,
        usa_medicacion_dormir,
        tabaco,
        paquetes_ano_fumador,
        anos_exfumador,
        alcohol,
        tipo_alcohol,
        frecuencia_alcohol,
        cantidad_alcohol,
        drogas_recreativas,
        frecuencia_drogas,
        consumo_cafeina,
        actividad_sexual,
        tipo_parejas,
        horas_pantallas_diarias,
        observaciones
    } = req.body;

    if (!id_consulta || !id_paciente) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    const checkQuery = `SELECT id FROM habitos_estilo_vida WHERE id_consulta = ?`;
    
    try {
        const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

        let query;
        let params;

        if (existingRecord.data.length > 0) {
            // UPDATE
            query = `
                UPDATE habitos_estilo_vida 
                SET dieta_descripcion = ?, consumo_agua_diario = ?, actividad_fisica = ?,
                    tipo_actividad_fisica = ?, frecuencia_actividad_fisica = ?, duracion_actividad_fisica = ?,
                    horas_sueno_diarias = ?, calidad_sueno = ?, usa_medicacion_dormir = ?,
                    tabaco = ?, paquetes_ano_fumador = ?, anos_exfumador = ?, alcohol = ?,
                    tipo_alcohol = ?, frecuencia_alcohol = ?, cantidad_alcohol = ?,
                    drogas_recreativas = ?, frecuencia_drogas = ?, consumo_cafeina = ?,
                    actividad_sexual = ?, tipo_parejas = ?, horas_pantallas_diarias = ?,
                    observaciones = ?, fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id_consulta = ?
            `;
            params = [
                dieta_descripcion, consumo_agua_diario, actividad_fisica,
                tipo_actividad_fisica, frecuencia_actividad_fisica, duracion_actividad_fisica,
                horas_sueno_diarias, calidad_sueno, usa_medicacion_dormir,
                tabaco, paquetes_ano_fumador, anos_exfumador, alcohol,
                tipo_alcohol, frecuencia_alcohol, cantidad_alcohol,
                drogas_recreativas, frecuencia_drogas, consumo_cafeina,
                actividad_sexual, tipo_parejas, horas_pantallas_diarias,
                observaciones, id_consulta
            ];
        } else {
            // INSERT
            query = `
                INSERT INTO habitos_estilo_vida 
                (id_consulta, id_paciente, dieta_descripcion, consumo_agua_diario, actividad_fisica,
                 tipo_actividad_fisica, frecuencia_actividad_fisica, duracion_actividad_fisica,
                 horas_sueno_diarias, calidad_sueno, usa_medicacion_dormir, tabaco, paquetes_ano_fumador,
                 anos_exfumador, alcohol, tipo_alcohol, frecuencia_alcohol, cantidad_alcohol,
                 drogas_recreativas, frecuencia_drogas, consumo_cafeina, actividad_sexual,
                 tipo_parejas, horas_pantallas_diarias, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            params = [
                id_consulta, id_paciente, dieta_descripcion, consumo_agua_diario, actividad_fisica,
                tipo_actividad_fisica, frecuencia_actividad_fisica, duracion_actividad_fisica,
                horas_sueno_diarias, calidad_sueno, usa_medicacion_dormir, tabaco, paquetes_ano_fumador,
                anos_exfumador, alcohol, tipo_alcohol, frecuencia_alcohol, cantidad_alcohol,
                drogas_recreativas, frecuencia_drogas, consumo_cafeina, actividad_sexual,
                tipo_parejas, horas_pantallas_diarias, observaciones
            ];
        }

        const result = await retornarQuery(query, params);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: existingRecord.data.length > 0 ? "Registro actualizado correctamente" : "Registro creado correctamente",
            result: result
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// POST para guardar/actualizar Antecedentes Familiares
router.post('/familiares', async (req, res) => {
    const {
        id_consulta,
        id_paciente,
        hipertension,
        diabetes,
        cancer,
        enfermedades_cardiacas,
        acv,
        enfermedades_neurologicas,
        enfermedades_autoinmunes,
        otras_enfermedades,
        sin_antecedentes,
        observaciones
    } = req.body;

    if (!id_consulta || !id_paciente) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    const checkQuery = `SELECT id FROM antecedentes_familiares WHERE id_consulta = ?`;
    
    try {
        const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

        let query;
        let params;

        if (existingRecord.data.length > 0) {
            // UPDATE
            query = `
                UPDATE antecedentes_familiares 
                SET hipertension = ?, diabetes = ?, cancer = ?, enfermedades_cardiacas = ?,
                    acv = ?, enfermedades_neurologicas = ?, enfermedades_autoinmunes = ?,
                    otras_enfermedades = ?, sin_antecedentes = ?, observaciones = ?,
                    fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id_consulta = ?
            `;
            params = [
                hipertension, diabetes, cancer, enfermedades_cardiacas,
                acv, enfermedades_neurologicas, enfermedades_autoinmunes,
                otras_enfermedades, sin_antecedentes, observaciones,
                id_consulta
            ];
        } else {
            // INSERT
            query = `
                INSERT INTO antecedentes_familiares 
                (id_consulta, id_paciente, hipertension, diabetes, cancer, enfermedades_cardiacas,
                 acv, enfermedades_neurologicas, enfermedades_autoinmunes, otras_enfermedades,
                 sin_antecedentes, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            params = [
                id_consulta, id_paciente, hipertension, diabetes, cancer, enfermedades_cardiacas,
                acv, enfermedades_neurologicas, enfermedades_autoinmunes, otras_enfermedades,
                sin_antecedentes, observaciones
            ];
        }

        const result = await retornarQuery(query, params);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: existingRecord.data.length > 0 ? "Registro actualizado correctamente" : "Registro creado correctamente",
            result: result
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// POST para guardar/actualizar Historia Enfermedad Actual
router.post('/enfermedad-actual', async (req, res) => {
    const {
        id_consulta,
        id_paciente,
        motivo_consulta,
        inicio_enfermedad,
        localizacion,
        caracter_calidad,
        intensidad,
        cronologia,
        factores_agravantes,
        factores_atenuantes,
        sintomas_asociados,
        tratamientos_previos,
        evolucion,
        observaciones
    } = req.body;

    if (!id_consulta || !id_paciente) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    const checkQuery = `SELECT id FROM historia_enfermedad_actual WHERE id_consulta = ?`;
    
    try {
        const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

        let query;
        let params;

        if (existingRecord.data.length > 0) {
            // UPDATE
            query = `
                UPDATE historia_enfermedad_actual 
                SET motivo_consulta = ?, inicio_enfermedad = ?, localizacion = ?,
                    caracter_calidad = ?, intensidad = ?, cronologia = ?,
                    factores_agravantes = ?, factores_atenuantes = ?, sintomas_asociados = ?,
                    tratamientos_previos = ?, evolucion = ?, observaciones = ?,
                    fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id_consulta = ?
            `;
            params = [
                motivo_consulta, inicio_enfermedad, localizacion,
                caracter_calidad, intensidad, cronologia,
                factores_agravantes, factores_atenuantes, sintomas_asociados,
                tratamientos_previos, evolucion, observaciones,
                id_consulta
            ];
        } else {
            // INSERT
            query = `
                INSERT INTO historia_enfermedad_actual 
                (id_consulta, id_paciente, motivo_consulta, inicio_enfermedad, localizacion,
                 caracter_calidad, intensidad, cronologia, factores_agravantes,
                 factores_atenuantes, sintomas_asociados, tratamientos_previos,
                 evolucion, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            params = [
                id_consulta, id_paciente, motivo_consulta, inicio_enfermedad, localizacion,
                caracter_calidad, intensidad, cronologia, factores_agravantes,
                factores_atenuantes, sintomas_asociados, tratamientos_previos,
                evolucion, observaciones
            ];
        }

        const result = await retornarQuery(query, params);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }
        
        await retornarQuery("UPDATE consultas SET motivo=? WHERE id_consulta = ?", [motivo_consulta,id_consulta]);
        return res.json({
            success: true,
            message: existingRecord.data.length > 0 ? "Registro actualizado correctamente" : "Registro creado correctamente",
            result: result
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// POST para guardar/actualizar Farmacológico Actual
router.post('/farmacologico-actual', async (req, res) => {
    const {
        id_consulta,
        id_paciente,
        medicamentos_recetados,
        automedicacion,
        suplementos_vitaminas,
        no_toma_medicamentos,
        observaciones
    } = req.body;

    if (!id_consulta || !id_paciente) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    const checkQuery = `SELECT id FROM farmacologico_actual WHERE id_consulta = ?`;
    
    try {
        const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

        let query;
        let params;

        if (existingRecord.data.length > 0) {
            // UPDATE
            query = `
                UPDATE farmacologico_actual 
                SET medicamentos_recetados = ?, automedicacion = ?, suplementos_vitaminas = ?,
                    no_toma_medicamentos = ?, observaciones = ?, fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id_consulta = ?
            `;
            params = [
                medicamentos_recetados, automedicacion, suplementos_vitaminas,
                no_toma_medicamentos, observaciones, id_consulta
            ];
        } else {
            // INSERT
            query = `
                INSERT INTO farmacologico_actual 
                (id_consulta, id_paciente, medicamentos_recetados, automedicacion,
                 suplementos_vitaminas, no_toma_medicamentos, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            params = [
                id_consulta, id_paciente, medicamentos_recetados, automedicacion,
                suplementos_vitaminas, no_toma_medicamentos, observaciones
            ];
        }

        const result = await retornarQuery(query, params);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: existingRecord.data.length > 0 ? "Registro actualizado correctamente" : "Registro creado correctamente",
            result: result
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// POST para guardar/actualizar Aspectos Psicosociales
router.post('/psicosociales', async (req, res) => {
    const {
        id_consulta,
        id_paciente,
        nivel_estudios,
        situacion_laboral,
        situacion_familiar,
        vivienda,
        creencias_culturales,
        eventos_estresantes,
        red_apoyo,
        observaciones_psicosociales
    } = req.body;

    if (!id_consulta || !id_paciente) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    const checkQuery = `SELECT id FROM aspectos_psicosociales WHERE id_consulta = ?`;
    
    try {
        const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

        let query;
        let params;

        if (existingRecord.data.length > 0) {
            // UPDATE
            query = `
                UPDATE aspectos_psicosociales 
                SET nivel_estudios = ?, situacion_laboral = ?, situacion_familiar = ?,
                    vivienda = ?, creencias_culturales = ?, eventos_estresantes = ?,
                    red_apoyo = ?, observaciones = ?, fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id_consulta = ?
            `;
            params = [
                nivel_estudios, situacion_laboral, situacion_familiar,
                vivienda, creencias_culturales, eventos_estresantes,
                red_apoyo, observaciones_psicosociales, id_consulta
            ];
        } else {
            // INSERT
            query = `
                INSERT INTO aspectos_psicosociales 
                (id_consulta, id_paciente, nivel_estudios, situacion_laboral, situacion_familiar,
                 vivienda, creencias_culturales, eventos_estresantes, red_apoyo, observaciones_psicosociales)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            params = [
                id_consulta, id_paciente, nivel_estudios, situacion_laboral, situacion_familiar,
                vivienda, creencias_culturales, eventos_estresantes, red_apoyo, observaciones_psicosociales
            ];
        }

        const result = await retornarQuery(query, params);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: existingRecord.data.length > 0 ? "Registro actualizado correctamente" : "Registro creado correctamente",
            result: result
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// PATCH para actualización parcial de Antecedentes Personales Patológicos
router.patch('/personales-patologicos/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const updateFields = req.body;

    if (!id_consulta || Object.keys(updateFields).length === 0) {
        return res.json({ error: "Faltan datos: id_consulta o campos a actualizar" });
    }

    // Verificar si existe el registro
    const checkQuery = `SELECT id FROM antecedentes_personales_patologicos WHERE id_consulta = ?`;
    const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

    if (existingRecord.data.length === 0) {
        return res.json({
            success: false,
            error: "No existe un registro para esta consulta"
        });
    }

    // Eliminar campos que no deberían actualizarse
    delete updateFields.id;
    delete updateFields.id_consulta;
    delete updateFields.id_paciente;
    delete updateFields.fecha_creacion;

    const setClause = Object.keys(updateFields)
        .map(key => `${key} = ?`)
        .join(', ');
    
    const values = [...Object.values(updateFields), id_consulta];

    const query = `
        UPDATE antecedentes_personales_patologicos 
        SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE id_consulta = ?
    `;

    try {
        const result = await retornarQuery(query, values);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Registro actualizado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});
 

// PATCH para actualización parcial de Antecedentes Ginecológicos
router.patch('/ginecologicos/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const updateFields = req.body;

    if (!id_consulta || Object.keys(updateFields).length === 0) {
        return res.json({ error: "Faltan datos: id_consulta o campos a actualizar" });
    }

    // Verificar si existe el registro
    const checkQuery = `SELECT id FROM antecedentes_ginecologicos WHERE id_consulta = ?`;
    const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

    if (existingRecord.data.length === 0) {
        return res.json({
            success: false,
            error: "No existe un registro para esta consulta"
        });
    }

    delete updateFields.id;
    delete updateFields.id_consulta;
    delete updateFields.id_paciente;
    delete updateFields.fecha_creacion;

    const setClause = Object.keys(updateFields)
        .map(key => `${key} = ?`)
        .join(', ');
    
    const values = [...Object.values(updateFields), id_consulta];

    const query = `
        UPDATE antecedentes_ginecologicos 
        SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE id_consulta = ?
    `;

    try {
        const result = await retornarQuery(query, values);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Registro actualizado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// PATCH para actualización parcial de Hábitos y Estilo de Vida
router.patch('/habitos-estilo-vida/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const updateFields = req.body;

    if (!id_consulta || Object.keys(updateFields).length === 0) {
        return res.json({ error: "Faltan datos: id_consulta o campos a actualizar" });
    }

    // Verificar si existe el registro
    const checkQuery = `SELECT id FROM habitos_estilo_vida WHERE id_consulta = ?`;
    const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

    if (existingRecord.data.length === 0) {
        return res.json({
            success: false,
            error: "No existe un registro para esta consulta"
        });
    }

    delete updateFields.id;
    delete updateFields.id_consulta;
    delete updateFields.id_paciente;
    delete updateFields.fecha_creacion;

    const setClause = Object.keys(updateFields)
        .map(key => `${key} = ?`)
        .join(', ');
    
    const values = [...Object.values(updateFields), id_consulta];

    const query = `
        UPDATE habitos_estilo_vida 
        SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE id_consulta = ?
    `;

    try {
        const result = await retornarQuery(query, values);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Registro actualizado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// PATCH para actualización parcial de Antecedentes Familiares
router.patch('/familiares/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const updateFields = req.body;

    if (!id_consulta || Object.keys(updateFields).length === 0) {
        return res.json({ error: "Faltan datos: id_consulta o campos a actualizar" });
    }

    // Verificar si existe el registro
    const checkQuery = `SELECT id FROM antecedentes_familiares WHERE id_consulta = ?`;
    const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

    if (existingRecord.data.length === 0) {
        return res.json({
            success: false,
            error: "No existe un registro para esta consulta"
        });
    }

    delete updateFields.id;
    delete updateFields.id_consulta;
    delete updateFields.id_paciente;
    delete updateFields.fecha_creacion;

    const setClause = Object.keys(updateFields)
        .map(key => `${key} = ?`)
        .join(', ');
    
    const values = [...Object.values(updateFields), id_consulta];

    const query = `
        UPDATE antecedentes_familiares 
        SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE id_consulta = ?
    `;

    try {
        const result = await retornarQuery(query, values);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Registro actualizado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// PATCH para actualización parcial de Historia Enfermedad Actual
router.patch('/enfermedad-actual/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const updateFields = req.body;

    if (!id_consulta || Object.keys(updateFields).length === 0) {
        return res.json({ error: "Faltan datos: id_consulta o campos a actualizar" });
    }

    // Verificar si existe el registro
    const checkQuery = `SELECT id FROM historia_enfermedad_actual WHERE id_consulta = ?`;
    const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

    if (existingRecord.data.length === 0) {
        return res.json({
            success: false,
            error: "No existe un registro para esta consulta"
        });
    }

    delete updateFields.id;
    delete updateFields.id_consulta;
    delete updateFields.id_paciente;
    delete updateFields.fecha_creacion;

    const setClause = Object.keys(updateFields)
        .map(key => `${key} = ?`)
        .join(', ');
    
    const values = [...Object.values(updateFields), id_consulta];

    const query = `
        UPDATE historia_enfermedad_actual 
        SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE id_consulta = ?
    `;
    if(setClause=="motivo_consulta = ?"){
        await retornarQuery("UPDATE consultas SET motivo=? WHERE id_consulta = ?", [...Object.values(updateFields), id_consulta]);
    }
    try {
        const result = await retornarQuery(query, values);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Registro actualizado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// PATCH para actualización parcial de Farmacológico Actual
router.patch('/farmacologico-actual/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const updateFields = req.body;

    if (!id_consulta || Object.keys(updateFields).length === 0) {
        return res.json({ error: "Faltan datos: id_consulta o campos a actualizar" });
    }

    // Verificar si existe el registro
    const checkQuery = `SELECT id FROM farmacologico_actual WHERE id_consulta = ?`;
    const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

    if (existingRecord.data.length === 0) {
        return res.json({
            success: false,
            error: "No existe un registro para esta consulta"
        });
    }

    delete updateFields.id;
    delete updateFields.id_consulta;
    delete updateFields.id_paciente;
    delete updateFields.fecha_creacion;

    const setClause = Object.keys(updateFields)
        .map(key => `${key} = ?`)
        .join(', ');
    
    const values = [...Object.values(updateFields), id_consulta];

    const query = `
        UPDATE farmacologico_actual 
        SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE id_consulta = ?
    `;

    try {
        const result = await retornarQuery(query, values);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Registro actualizado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// PATCH para actualización parcial de Aspectos Psicosociales
router.patch('/psicosociales/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const updateFields = req.body;

    if (!id_consulta || Object.keys(updateFields).length === 0) {
        return res.json({ error: "Faltan datos: id_consulta o campos a actualizar" });
    }

    // Verificar si existe el registro
    const checkQuery = `SELECT id FROM aspectos_psicosociales WHERE id_consulta = ?`;
    const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

    if (existingRecord.data.length === 0) {
        return res.json({
            success: false,
            error: "No existe un registro para esta consulta"
        });
    }

    delete updateFields.id;
    delete updateFields.id_consulta;
    delete updateFields.id_paciente;
    delete updateFields.fecha_creacion;

    const setClause = Object.keys(updateFields)
        .map(key => `${key} = ?`)
        .join(', ');
    
    const values = [...Object.values(updateFields), id_consulta];

    const query = `
        UPDATE aspectos_psicosociales 
        SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
        WHERE id_consulta = ?
    `;

    try {
        const result = await retornarQuery(query, values);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Registro actualizado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// PATCH para actualización masiva de múltiples secciones
router.patch('/todos/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const updates = req.body;

    if (!id_consulta || Object.keys(updates).length === 0) {
        return res.json({ error: "Faltan datos: id_consulta o campos a actualizar" });
    }

    try {
        const results = {};
        const errors = [];
        
        // Mapeo de secciones a tablas
        const tableMap = {
            'personalesPatologicos': 'antecedentes_personales_patologicos',
            'ginecologicos': 'antecedentes_ginecologicos',
            'habitosEstiloVida': 'habitos_estilo_vida',
            'familiares': 'antecedentes_familiares',
            'enfermedadActual': 'historia_enfermedad_actual',
            'farmacologicoActual': 'farmacologico_actual',
            'psicosociales': 'aspectos_psicosociales'
        };

        // Ejecutar actualizaciones para cada sección que venga en el body
        for (const [section, data] of Object.entries(updates)) {
            if (Object.keys(data).length > 0) {
                const tableName = tableMap[section];
                
                if (tableName) {
                    // Verificar si existe el registro
                    const checkQuery = `SELECT id FROM ${tableName} WHERE id_consulta = ?`;
                    const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

                    if (existingRecord.data.length === 0) {
                        errors.push(`No existe registro en ${section} para esta consulta`);
                        results[section] = { success: false, error: "Registro no encontrado" };
                        continue;
                    }

                    // Eliminar campos protegidos
                    const cleanData = { ...data };
                    delete cleanData.id;
                    delete cleanData.id_consulta;
                    delete cleanData.id_paciente;
                    delete cleanData.fecha_creacion;

                    if (Object.keys(cleanData).length === 0) {
                        errors.push(`No hay campos válidos para actualizar en ${section}`);
                        results[section] = { success: false, error: "No hay campos válidos" };
                        continue;
                    }

                    const setClause = Object.keys(cleanData)
                        .map(key => `${key} = ?`)
                        .join(', ');
                    
                    const values = [...Object.values(cleanData), id_consulta];

                    const query = `
                        UPDATE ${tableName} 
                        SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
                        WHERE id_consulta = ?
                    `;

                    const result = await retornarQuery(query, values);
                    
                    if (result.error) {
                        errors.push(`Error en ${section}: ${result.error}`);
                        results[section] = { success: false, error: result.error };
                    } else {
                        results[section] = { 
                            success: true, 
                            affectedRows: result.affectedRows,
                            message: "Actualizado correctamente"
                        };
                    }
                } else {
                    errors.push(`Sección no válida: ${section}`);
                    results[section] = { success: false, error: "Sección no válida" };
                }
            }
        }

        const overallSuccess = errors.length === 0;

        return res.json({
            success: overallSuccess,
            message: overallSuccess ? "Todas las actualizaciones realizadas correctamente" : "Algunas actualizaciones fallaron",
            results: results,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// PATCH para actualizar múltiples campos específicos de cualquier tabla
router.patch('/campo-especifico/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const { tabla, campos } = req.body;

    if (!id_consulta || !tabla || !campos || Object.keys(campos).length === 0) {
        return res.json({ error: "Faltan datos: id_consulta, tabla o campos a actualizar" });
    }

    // Validar que la tabla existe en nuestro mapeo
    const tablasPermitidas = [
        'antecedentes_personales_patologicos',
        'antecedentes_ginecologicos',
        'habitos_estilo_vida',
        'antecedentes_familiares',
        'historia_enfermedad_actual',
        'farmacologico_actual',
        'aspectos_psicosociales'
    ];

    if (!tablasPermitidas.includes(tabla)) {
        return res.json({
            success: false,
            error: "Tabla no válida"
        });
    }

    try {
        // Verificar si existe el registro
        const checkQuery = `SELECT id FROM ${tabla} WHERE id_consulta = ?`;
        const existingRecord = await retornarQuery(checkQuery, [id_consulta]);

        if (existingRecord.data.length === 0) {
            return res.json({
                success: false,
                error: "No existe un registro para esta consulta en la tabla especificada"
            });
        }

        // Eliminar campos protegidos
        const cleanCampos = { ...campos };
        delete cleanCampos.id;
        delete cleanCampos.id_consulta;
        delete cleanCampos.id_paciente;
        delete cleanCampos.fecha_creacion;

        if (Object.keys(cleanCampos).length === 0) {
            return res.json({
                success: false,
                error: "No hay campos válidos para actualizar"
            });
        }

        const setClause = Object.keys(cleanCampos)
            .map(key => `${key} = ?`)
            .join(', ');
        
        const values = [...Object.values(cleanCampos), id_consulta];

        const query = `
            UPDATE ${tabla} 
            SET ${setClause}, fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id_consulta = ?
        `;

        const result = await retornarQuery(query, values);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Campos actualizados correctamente",
            affectedRows: result.affectedRows,
            camposActualizados: Object.keys(cleanCampos)
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

router.post('/revision-sistemas', async (req, res) => {
    const { id_consulta, sistemas } = req.body;

    if (!id_consulta || !sistemas || !Array.isArray(sistemas)) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    try {
        // Eliminar registros existentes para esta consulta
        const deleteQuery = `DELETE FROM consulta_exam_sistema WHERE id_consulta = ?`;
        await retornarQuery(deleteQuery, [id_consulta]);

        // Insertar nuevos registros
        const insertPromises = sistemas.map(sistema => {
            if (sistema.tipo_examen && sistema.sistema_examen) {
                const query = `
                    INSERT INTO consulta_exam_sistema 
                    (id_consulta, tipo_examen, sistema_examen, detalle_examen)
                    VALUES (?, ?, ?, ?)
                `;
                return retornarQuery(query, [
                    id_consulta, 
                    sistema.tipo_examen, 
                    sistema.sistema_examen, 
                    sistema.detalle_examen || null
                ]);
            }
            return Promise.resolve({ success: true });
        });

        const results = await Promise.all(insertPromises);

        // Verificar si hay errores
        const hasError = results.some(result => result.error);
        
        if (hasError) {
            return res.json({
                success: false,
                error: "Error al guardar algunos sistemas"
            });
        }

        return res.json({
            success: true,
            message: "Revisión por sistemas guardada correctamente",
            sistemasGuardados: sistemas.length
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

router.patch('/revision-sistemas/:id_consulta_exam', async (req, res) => {
    const { id_consulta_exam } = req.params;
    const { detalle_examen } = req.body;

    if (!id_consulta_exam) {
        return res.json({ error: "Falta id_consulta_exam" });
    }

    try {
        const query = `
            UPDATE consulta_exam_sistema 
            SET detalle_examen = ?, fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id_consulta_exam = ?
        `;

        const result = await retornarQuery(query, [detalle_examen, id_consulta_exam]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Detalle de sistema actualizado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

router.get('/revision-sistemas/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    const query = `
        SELECT * FROM consulta_exam_sistema 
        WHERE id_consulta = ?
        ORDER BY sistema_examen, tipo_examen
    `;

    try {
        const result = await retornarQuery(query, [id_consulta]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            result: result
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// POST para guardar/actualizar un item individual
router.post('/revision-sistemas-item/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const { sistema_examen, tipo_examen, detalle_examen } = req.body;

    if (!id_consulta || !sistema_examen || !tipo_examen) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    try {        
        const query = `
            INSERT INTO consulta_exam_sistema 
            (id_consulta, sistema_examen, tipo_examen, detalle_examen)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            detalle_examen = VALUES(detalle_examen)
        `;
        
        const params = [id_consulta, sistema_examen, tipo_examen, detalle_examen || ''];

        const result = await retornarQuery(query, params);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Item guardado correctamente",
            affectedRows: result.affectedRows
        });

    } catch (error) { registrarErrorPeticion(req, error);
        
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// DELETE para eliminar un item
router.delete('/revision-sistemas-item/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    const { sistema_examen, tipo_examen } = req.body;

    if (!id_consulta || !sistema_examen || !tipo_examen) {
        return res.json({ error: "Faltan datos obligatorios" });
    }

    try {
        const query = `
            DELETE FROM consulta_exam_sistema 
            WHERE id_consulta = ? AND sistema_examen = ? AND tipo_examen = ?
        `;
        
        const result = await retornarQuery(query, [id_consulta, sistema_examen, tipo_examen]);

        if (result.error) {
            return res.json({
                success: false,
                error: result.error
            });
        }

        return res.json({
            success: true,
            message: "Item eliminado correctamente"
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// routes/antecedentes.js - Agregar esta ruta
router.get('/imprimir/:id_consulta', async (req, res) => {
    const { id_consulta } = req.params;
    
    if (!id_consulta) {
        return res.json({ error: "Falta id_consulta" });
    }

    try {
        // Ejecutar todas las consultas en paralelo
        const [
            datosPaciente,
            personalesPatologicos,
            ginecologicos,
            habitosEstiloVida,
            familiares,
            enfermedadActual,
            farmacologicoActual,
            psicosociales,
            revisionSistemas
        ] = await Promise.all([
            // Datos del paciente (asumiendo que tienes esta tabla)
            retornarQuery('SELECT * FROM pacientes WHERE id_paciente IN (SELECT id_paciente FROM antecedentes_familiares WHERE id_consulta = ?)', [id_consulta]),
            retornarQuery('SELECT * FROM antecedentes_personales_patologicos WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM antecedentes_ginecologicos WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM habitos_estilo_vida WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM antecedentes_familiares WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM historia_enfermedad_actual WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM farmacologico_actual WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM aspectos_psicosociales WHERE id_consulta = ? ORDER BY fecha_creacion DESC LIMIT 1', [id_consulta]),
            retornarQuery('SELECT * FROM consulta_exam_sistema WHERE id_consulta = ? ORDER BY sistema_examen, tipo_examen', [id_consulta])
        ]);

        // Verificar si hay errores
        const queries = [datosPaciente, personalesPatologicos, ginecologicos, habitosEstiloVida, familiares, enfermedadActual, farmacologicoActual, psicosociales, revisionSistemas];
        const hasError = queries.some(query => query && query.error);
        
        if (hasError) {
            return res.json({
                success: false,
                error: "Error en una o más consultas"
            });
        }
        return res.json({
            success: true,
            data: {
                paciente: datosPaciente.data.length > 0 ? datosPaciente.data[0] : null,
                personalesPatologicos: personalesPatologicos.data.length > 0 ? personalesPatologicos.data[0] : null,
                ginecologicos: ginecologicos.data.length > 0 ? ginecologicos.data[0] : null,
                habitosEstiloVida: habitosEstiloVida.data.length > 0 ? habitosEstiloVida.data[0] : null,
                familiares: familiares.data.length > 0 ? familiares.data[0] : null,
                enfermedadActual: enfermedadActual.data.length > 0 ? enfermedadActual.data[0] : null,
                farmacologicoActual: farmacologicoActual.data.length > 0 ? farmacologicoActual.data[0] : null,
                psicosociales: psicosociales.data.length > 0 ? psicosociales.data[0] : null,
                revisionSistemas: revisionSistemas || []
            }
        });

    } catch (error) { registrarErrorPeticion(req, error);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;