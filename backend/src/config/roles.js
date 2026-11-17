// Stable role codes. Keep synchronized with migration 003; labels never grant permissions.
export const ROLES = Object.freeze([
  {
    "code": "admin",
    "label": "Administrador",
    "department": "General"
  },
  {
    "code": "rrhh",
    "label": "Recursos Humanos",
    "department": "General"
  },
  {
    "code": "supervisor",
    "label": "Supervisor",
    "department": "General"
  },
  {
    "code": "colaborador",
    "label": "Colaborador",
    "department": "General"
  },
  {
    "code": "rrhh_director",
    "label": "Dirección de Recursos Humanos",
    "department": "Recursos Humanos"
  },
  {
    "code": "rrhh_gerente",
    "label": "Gerencia de Recursos Humanos",
    "department": "Recursos Humanos"
  },
  {
    "code": "rrhh_jefe",
    "label": "Jefatura de Recursos Humanos",
    "department": "Recursos Humanos"
  },
  {
    "code": "rrhh_coordinador",
    "label": "Coordinación de Recursos Humanos",
    "department": "Recursos Humanos"
  },
  {
    "code": "rrhh_analista",
    "label": "Analista de Recursos Humanos",
    "department": "Recursos Humanos"
  },
  {
    "code": "rrhh_especialista",
    "label": "Especialista de Recursos Humanos",
    "department": "Recursos Humanos"
  },
  {
    "code": "rrhh_asistente",
    "label": "Asistente de Recursos Humanos",
    "department": "Recursos Humanos"
  },
  {
    "code": "rrhh_auxiliar",
    "label": "Auxiliar de Recursos Humanos",
    "department": "Recursos Humanos"
  },
  {
    "code": "finanzas_director",
    "label": "Dirección de Finanzas",
    "department": "Finanzas"
  },
  {
    "code": "finanzas_gerente",
    "label": "Gerencia de Finanzas",
    "department": "Finanzas"
  },
  {
    "code": "finanzas_jefe",
    "label": "Jefatura de Finanzas",
    "department": "Finanzas"
  },
  {
    "code": "finanzas_coordinador",
    "label": "Coordinación de Finanzas",
    "department": "Finanzas"
  },
  {
    "code": "finanzas_analista",
    "label": "Analista de Finanzas",
    "department": "Finanzas"
  },
  {
    "code": "finanzas_especialista",
    "label": "Especialista de Finanzas",
    "department": "Finanzas"
  },
  {
    "code": "finanzas_asistente",
    "label": "Asistente de Finanzas",
    "department": "Finanzas"
  },
  {
    "code": "finanzas_auxiliar",
    "label": "Auxiliar de Finanzas",
    "department": "Finanzas"
  },
  {
    "code": "legal_director",
    "label": "Dirección de Legal",
    "department": "Legal"
  },
  {
    "code": "legal_gerente",
    "label": "Gerencia de Legal",
    "department": "Legal"
  },
  {
    "code": "legal_jefe",
    "label": "Jefatura de Legal",
    "department": "Legal"
  },
  {
    "code": "legal_coordinador",
    "label": "Coordinación de Legal",
    "department": "Legal"
  },
  {
    "code": "legal_analista",
    "label": "Analista de Legal",
    "department": "Legal"
  },
  {
    "code": "legal_especialista",
    "label": "Especialista de Legal",
    "department": "Legal"
  },
  {
    "code": "legal_asistente",
    "label": "Asistente de Legal",
    "department": "Legal"
  },
  {
    "code": "legal_auxiliar",
    "label": "Auxiliar de Legal",
    "department": "Legal"
  },
  {
    "code": "tecnologia_director",
    "label": "Dirección de Tecnología",
    "department": "Tecnología"
  },
  {
    "code": "tecnologia_gerente",
    "label": "Gerencia de Tecnología",
    "department": "Tecnología"
  },
  {
    "code": "tecnologia_jefe",
    "label": "Jefatura de Tecnología",
    "department": "Tecnología"
  },
  {
    "code": "tecnologia_coordinador",
    "label": "Coordinación de Tecnología",
    "department": "Tecnología"
  },
  {
    "code": "tecnologia_analista",
    "label": "Analista de Tecnología",
    "department": "Tecnología"
  },
  {
    "code": "tecnologia_especialista",
    "label": "Especialista de Tecnología",
    "department": "Tecnología"
  },
  {
    "code": "tecnologia_asistente",
    "label": "Asistente de Tecnología",
    "department": "Tecnología"
  },
  {
    "code": "tecnologia_auxiliar",
    "label": "Auxiliar de Tecnología",
    "department": "Tecnología"
  },
  {
    "code": "operaciones_director",
    "label": "Dirección de Operaciones",
    "department": "Operaciones"
  },
  {
    "code": "operaciones_gerente",
    "label": "Gerencia de Operaciones",
    "department": "Operaciones"
  },
  {
    "code": "operaciones_jefe",
    "label": "Jefatura de Operaciones",
    "department": "Operaciones"
  },
  {
    "code": "operaciones_coordinador",
    "label": "Coordinación de Operaciones",
    "department": "Operaciones"
  },
  {
    "code": "operaciones_analista",
    "label": "Analista de Operaciones",
    "department": "Operaciones"
  },
  {
    "code": "operaciones_especialista",
    "label": "Especialista de Operaciones",
    "department": "Operaciones"
  },
  {
    "code": "operaciones_asistente",
    "label": "Asistente de Operaciones",
    "department": "Operaciones"
  },
  {
    "code": "operaciones_auxiliar",
    "label": "Auxiliar de Operaciones",
    "department": "Operaciones"
  },
  {
    "code": "ventas_director",
    "label": "Dirección de Ventas",
    "department": "Ventas"
  },
  {
    "code": "ventas_gerente",
    "label": "Gerencia de Ventas",
    "department": "Ventas"
  },
  {
    "code": "ventas_jefe",
    "label": "Jefatura de Ventas",
    "department": "Ventas"
  },
  {
    "code": "ventas_coordinador",
    "label": "Coordinación de Ventas",
    "department": "Ventas"
  },
  {
    "code": "ventas_analista",
    "label": "Analista de Ventas",
    "department": "Ventas"
  },
  {
    "code": "ventas_especialista",
    "label": "Especialista de Ventas",
    "department": "Ventas"
  },
  {
    "code": "ventas_asistente",
    "label": "Asistente de Ventas",
    "department": "Ventas"
  },
  {
    "code": "ventas_auxiliar",
    "label": "Auxiliar de Ventas",
    "department": "Ventas"
  },
  {
    "code": "marketing_director",
    "label": "Dirección de Marketing",
    "department": "Marketing"
  },
  {
    "code": "marketing_gerente",
    "label": "Gerencia de Marketing",
    "department": "Marketing"
  },
  {
    "code": "marketing_jefe",
    "label": "Jefatura de Marketing",
    "department": "Marketing"
  },
  {
    "code": "marketing_coordinador",
    "label": "Coordinación de Marketing",
    "department": "Marketing"
  },
  {
    "code": "marketing_analista",
    "label": "Analista de Marketing",
    "department": "Marketing"
  },
  {
    "code": "marketing_especialista",
    "label": "Especialista de Marketing",
    "department": "Marketing"
  },
  {
    "code": "marketing_asistente",
    "label": "Asistente de Marketing",
    "department": "Marketing"
  },
  {
    "code": "marketing_auxiliar",
    "label": "Auxiliar de Marketing",
    "department": "Marketing"
  },
  {
    "code": "atencion_cliente_director",
    "label": "Dirección de Atención al Cliente",
    "department": "Atención al Cliente"
  },
  {
    "code": "atencion_cliente_gerente",
    "label": "Gerencia de Atención al Cliente",
    "department": "Atención al Cliente"
  },
  {
    "code": "atencion_cliente_jefe",
    "label": "Jefatura de Atención al Cliente",
    "department": "Atención al Cliente"
  },
  {
    "code": "atencion_cliente_coordinador",
    "label": "Coordinación de Atención al Cliente",
    "department": "Atención al Cliente"
  },
  {
    "code": "atencion_cliente_analista",
    "label": "Analista de Atención al Cliente",
    "department": "Atención al Cliente"
  },
  {
    "code": "atencion_cliente_especialista",
    "label": "Especialista de Atención al Cliente",
    "department": "Atención al Cliente"
  },
  {
    "code": "atencion_cliente_asistente",
    "label": "Asistente de Atención al Cliente",
    "department": "Atención al Cliente"
  },
  {
    "code": "atencion_cliente_auxiliar",
    "label": "Auxiliar de Atención al Cliente",
    "department": "Atención al Cliente"
  },
  {
    "code": "compras_director",
    "label": "Dirección de Compras",
    "department": "Compras"
  },
  {
    "code": "compras_gerente",
    "label": "Gerencia de Compras",
    "department": "Compras"
  },
  {
    "code": "compras_jefe",
    "label": "Jefatura de Compras",
    "department": "Compras"
  },
  {
    "code": "compras_coordinador",
    "label": "Coordinación de Compras",
    "department": "Compras"
  },
  {
    "code": "compras_analista",
    "label": "Analista de Compras",
    "department": "Compras"
  },
  {
    "code": "compras_especialista",
    "label": "Especialista de Compras",
    "department": "Compras"
  },
  {
    "code": "compras_asistente",
    "label": "Asistente de Compras",
    "department": "Compras"
  },
  {
    "code": "compras_auxiliar",
    "label": "Auxiliar de Compras",
    "department": "Compras"
  },
  {
    "code": "logistica_director",
    "label": "Dirección de Logística",
    "department": "Logística"
  },
  {
    "code": "logistica_gerente",
    "label": "Gerencia de Logística",
    "department": "Logística"
  },
  {
    "code": "logistica_jefe",
    "label": "Jefatura de Logística",
    "department": "Logística"
  },
  {
    "code": "logistica_coordinador",
    "label": "Coordinación de Logística",
    "department": "Logística"
  },
  {
    "code": "logistica_analista",
    "label": "Analista de Logística",
    "department": "Logística"
  },
  {
    "code": "logistica_especialista",
    "label": "Especialista de Logística",
    "department": "Logística"
  },
  {
    "code": "logistica_asistente",
    "label": "Asistente de Logística",
    "department": "Logística"
  },
  {
    "code": "logistica_auxiliar",
    "label": "Auxiliar de Logística",
    "department": "Logística"
  },
  {
    "code": "produccion_director",
    "label": "Dirección de Producción",
    "department": "Producción"
  },
  {
    "code": "produccion_gerente",
    "label": "Gerencia de Producción",
    "department": "Producción"
  },
  {
    "code": "produccion_jefe",
    "label": "Jefatura de Producción",
    "department": "Producción"
  },
  {
    "code": "produccion_coordinador",
    "label": "Coordinación de Producción",
    "department": "Producción"
  },
  {
    "code": "produccion_analista",
    "label": "Analista de Producción",
    "department": "Producción"
  },
  {
    "code": "produccion_especialista",
    "label": "Especialista de Producción",
    "department": "Producción"
  },
  {
    "code": "produccion_asistente",
    "label": "Asistente de Producción",
    "department": "Producción"
  },
  {
    "code": "produccion_auxiliar",
    "label": "Auxiliar de Producción",
    "department": "Producción"
  },
  {
    "code": "calidad_director",
    "label": "Dirección de Calidad",
    "department": "Calidad"
  },
  {
    "code": "calidad_gerente",
    "label": "Gerencia de Calidad",
    "department": "Calidad"
  },
  {
    "code": "calidad_jefe",
    "label": "Jefatura de Calidad",
    "department": "Calidad"
  },
  {
    "code": "calidad_coordinador",
    "label": "Coordinación de Calidad",
    "department": "Calidad"
  },
  {
    "code": "calidad_analista",
    "label": "Analista de Calidad",
    "department": "Calidad"
  },
  {
    "code": "calidad_especialista",
    "label": "Especialista de Calidad",
    "department": "Calidad"
  },
  {
    "code": "calidad_asistente",
    "label": "Asistente de Calidad",
    "department": "Calidad"
  },
  {
    "code": "calidad_auxiliar",
    "label": "Auxiliar de Calidad",
    "department": "Calidad"
  }
]);
export const ROLE_CODES = Object.freeze(ROLES.map(role=>role.code));
