// Categorías base de gastos. Vive fuera del componente cliente de Gastos para que las páginas
// del servidor puedan leerla como un arreglo normal (desde un módulo "use client" llegaría
// como una referencia y fallaría al expandirla).
export const EXPENSE_CATEGORIES = ["Alquiler", "Nómina", "Servicios públicos", "Mercadeo", "Compras", "Otros"];
