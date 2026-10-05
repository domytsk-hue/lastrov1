import type { Category, CategoryId } from "../lib/types.ts";

export const CATEGORIES: Category[] = [
  {
    id: "alimentacao",
    name: "Alimentação",
    kind: "expense",
    icon: "utensils",
    color: "#00D99B",
    keywords: ["almoço", "almoco", "jantar", "café", "cafe", "mercado", "supermercado", "ifood", "delivery", "padaria", "restaurante", "lanche", "pizza", "feira", "açougue", "comida", "hamburguer", "sushi", "bar"],
  },
  {
    id: "transporte",
    name: "Transporte",
    kind: "expense",
    icon: "car",
    color: "#5B8CFF",
    keywords: ["uber", "99", "gasolina", "combustível", "combustivel", "posto", "ônibus", "onibus", "metrô", "metro", "estacionamento", "pedágio", "pedagio", "taxi", "táxi", "etanol", "bilhete"],
  },
  {
    id: "moradia",
    name: "Moradia",
    kind: "expense",
    icon: "home",
    color: "#8B6BFF",
    fixed: true,
    keywords: ["aluguel", "condomínio", "condominio", "luz", "energia", "água", "agua", "gás", "gas", "internet", "iptu", "casa", "faxina", "diarista"],
  },
  {
    id: "compras",
    name: "Compras",
    kind: "expense",
    icon: "shopping-bag",
    color: "#FF8A5B",
    keywords: ["roupa", "tênis", "tenis", "amazon", "shopee", "mercado livre", "presente", "loja", "shopping", "eletrônico", "eletronico"],
  },
  {
    id: "saude",
    name: "Saúde",
    kind: "expense",
    icon: "heart-pulse",
    color: "#FF6B81",
    keywords: ["farmácia", "farmacia", "remédio", "remedio", "médico", "medico", "consulta", "dentista", "exame", "academia", "plano de saúde", "terapia", "psicólogo"],
  },
  {
    id: "lazer",
    name: "Lazer",
    kind: "expense",
    icon: "ticket",
    color: "#FFC234",
    keywords: ["cinema", "show", "ingresso", "viagem", "passeio", "festa", "balada", "jogo", "game", "teatro", "praia", "cerveja"],
  },
  {
    id: "assinaturas",
    name: "Assinaturas",
    kind: "expense",
    icon: "repeat",
    color: "#C77DFF",
    fixed: true,
    keywords: ["netflix", "spotify", "assinatura", "prime", "disney", "hbo", "youtube", "icloud", "chatgpt", "max", "globoplay", "deezer"],
  },
  {
    id: "educacao",
    name: "Educação",
    kind: "expense",
    icon: "graduation-cap",
    color: "#4FE3C1",
    fixed: true,
    keywords: ["curso", "livro", "faculdade", "escola", "inglês", "ingles", "aula", "mensalidade", "udemy", "alura"],
  },
  {
    id: "outros",
    name: "Outros",
    kind: "expense",
    icon: "circle-dashed",
    color: "#AEB4BD",
    keywords: [],
  },
  {
    id: "salario",
    name: "Salário",
    kind: "income",
    icon: "briefcase",
    color: "#00D99B",
    keywords: ["salário", "salario", "pagamento", "holerite"],
  },
  {
    id: "freelance",
    name: "Freelance",
    kind: "income",
    icon: "sparkles",
    color: "#4FE3C1",
    keywords: ["freela", "freelance", "projeto", "job", "cliente"],
  },
  {
    id: "rendimentos",
    name: "Rendimentos",
    kind: "income",
    icon: "trending-up",
    color: "#5B8CFF",
    keywords: ["rendimento", "dividendo", "dividendos", "juros", "cashback"],
  },
  {
    id: "outras-receitas",
    name: "Outras receitas",
    kind: "income",
    icon: "plus-circle",
    color: "#AEB4BD",
    keywords: ["reembolso", "pix recebido", "venda", "presente recebido"],
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id?: CategoryId): Category {
  return BY_ID.get(id ?? "outros") ?? BY_ID.get("outros")!;
}

export const EXPENSE_CATEGORIES = CATEGORIES.filter((c) => c.kind === "expense");
export const INCOME_CATEGORIES = CATEGORIES.filter((c) => c.kind === "income");
