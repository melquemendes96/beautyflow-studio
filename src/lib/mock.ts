export type Status = "agendado" | "confirmado" | "concluido" | "cancelado" | "nao-compareceu";

export const statusLabel: Record<Status, string> = {
  "agendado": "Agendado",
  "confirmado": "Confirmado",
  "concluido": "Concluído",
  "cancelado": "Cancelado",
  "nao-compareceu": "Não compareceu",
};

export const statusClass: Record<Status, string> = {
  "agendado": "bg-info/15 text-info",
  "confirmado": "bg-purple-soft/15 text-purple-soft",
  "concluido": "bg-success/15 text-success",
  "cancelado": "bg-warning/20 text-warning",
  "nao-compareceu": "bg-destructive/15 text-destructive",
};

export const empresa = {
  nome: "Joyce Mendes BeautyFlow",
  slogan: "Realçando a sua melhor versão",
  slug: "joyce-mendes",
  instagram: "@joycemendes.beauty",
  whatsapp: "(11) 91234-5678",
  endereco: "Rua das Acácias, 120 — Vila Madalena, São Paulo",
  boasVindas: "Seja bem-vinda! Escolha o serviço, a data e o horário ideais para você. Atendimento exclusivo com hora marcada.",
};

export const servicos = [
  { id: "1", nome: "Design de Sobrancelhas", descricao: "Modelagem com henna premium", preco: 80, duracao: 45, categoria: "Sobrancelhas", ativo: true, img: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600" },
  { id: "2", nome: "Lash Volume Brasileiro", descricao: "Extensão de cílios fio a fio", preco: 220, duracao: 120, categoria: "Cílios", ativo: true, img: "https://images.unsplash.com/photo-1583241800698-9c2e0e2ed7df?w=600" },
  { id: "3", nome: "Lash Lifting", descricao: "Curvatura natural e duradoura", preco: 180, duracao: 60, categoria: "Cílios", ativo: true, img: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=600" },
  { id: "4", nome: "Limpeza de Pele Profunda", descricao: "Tratamento estético completo", preco: 250, duracao: 90, categoria: "Estética", ativo: true, img: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600" },
  { id: "5", nome: "Micropigmentação", descricao: "Sobrancelhas fio a fio", preco: 650, duracao: 150, categoria: "Sobrancelhas", ativo: false, img: "https://images.unsplash.com/photo-1559599101-f09722fb4948?w=600" },
];

export const clientes = [
  { id: "1", nome: "Mariana Costa", email: "mariana@email.com", whatsapp: "(11) 99999-1111", atendimentos: 14, faltas: 0, cancelamentos: 1 },
  { id: "2", nome: "Beatriz Santos", email: "bia@email.com", whatsapp: "(11) 99999-2222", atendimentos: 9, faltas: 1, cancelamentos: 0 },
  { id: "3", nome: "Camila Rodrigues", email: "camila@email.com", whatsapp: "(11) 99999-3333", atendimentos: 22, faltas: 0, cancelamentos: 2 },
  { id: "4", nome: "Larissa Almeida", email: "lari@email.com", whatsapp: "(11) 99999-4444", atendimentos: 5, faltas: 2, cancelamentos: 1 },
  { id: "5", nome: "Júlia Ferreira", email: "julia@email.com", whatsapp: "(11) 99999-5555", atendimentos: 31, faltas: 0, cancelamentos: 0 },
];

export const agendaHoje = [
  { hora: "09:00", cliente: "Mariana Costa", servico: "Design de Sobrancelhas", status: "confirmado" as Status },
  { hora: "10:00", cliente: "Beatriz Santos", servico: "Lash Lifting", status: "agendado" as Status },
  { hora: "11:30", cliente: "—", servico: "Livre", status: "concluido" as Status },
  { hora: "14:00", cliente: "Camila Rodrigues", servico: "Lash Volume Brasileiro", status: "confirmado" as Status },
  { hora: "16:30", cliente: "Júlia Ferreira", servico: "Limpeza de Pele", status: "agendado" as Status },
];

export const listaEspera = [
  { id: "1", cliente: "Renata Lima", servico: "Lash Volume", data: "12/05", whatsapp: "(11) 98888-1111" },
  { id: "2", cliente: "Patrícia Souza", servico: "Design Sobrancelhas", data: "13/05", whatsapp: "(11) 98888-2222" },
  { id: "3", cliente: "Aline Pereira", servico: "Limpeza de Pele", data: "14/05", whatsapp: "(11) 98888-3333" },
];

export const meusAtendimentos = [
  { id: "p1", servico: "Lash Volume Brasileiro", data: "10 de maio, sábado", hora: "14:00", empresa: empresa.nome, status: "confirmado" as Status, proximo: true },
  { id: "h1", servico: "Design de Sobrancelhas", data: "22 de abril", hora: "10:30", empresa: empresa.nome, status: "concluido" as Status, avaliacao: 5 },
  { id: "h2", servico: "Lash Lifting", data: "08 de abril", hora: "16:00", empresa: empresa.nome, status: "concluido" as Status, avaliacao: 5 },
  { id: "h3", servico: "Limpeza de Pele", data: "20 de março", hora: "11:00", empresa: empresa.nome, status: "cancelado" as Status },
];

export const planos = [
  {
    id: "essencial", nome: "Essencial Beauty", preco: 49, destaque: false,
    descricao: "Comece a digitalizar sua agenda hoje mesmo.",
    features: [
      "Agenda online",
      "Cadastro de serviços",
      "Cadastro de clientes",
      "Histórico de atendimentos",
      "Página pública de agendamento",
      "Painel administrativo básico",
    ],
  },
  {
    id: "pro", nome: "Studio Pro", preco: 79, destaque: true,
    descricao: "O plano ideal para studios que querem brilhar.",
    features: [
      "Tudo do Essencial",
      "Personalização de marca, logo e cores",
      "Lista de espera",
      "Relatórios completos",
      "Bloqueio manhã / tarde / dia",
      "Área exclusiva do cliente",
    ],
  },
  {
    id: "elite", nome: "Elite Beauty", preco: 119, destaque: false,
    descricao: "Automação premium para alta performance.",
    features: [
      "Tudo do Studio Pro",
      "WhatsApp Oficial Meta",
      "Lembretes automáticos",
      "Dashboard avançado",
      "Suporte prioritário",
      "Recursos de automação",
    ],
  },
];
