import { createContext, useContext } from 'react';
import type { Person, PersonRef, User } from '../types/api';
import { personEmail, personName } from '../types/api';

/** Resolve uma referência de pessoa (objeto ou e-mail) para {email,name,picture}. */
export type PersonResolver = (ref: PersonRef) => Person;

const identityResolver: PersonResolver = (ref) => ({
  email: personEmail(ref),
  name: personName(ref),
  picture: typeof ref === 'object' ? ref.picture : undefined,
});

/**
 * Cria um resolver que enriquece a pessoa a partir do cadastro de usuários,
 * usando o **e-mail** como chave única (dois usuários podem ter o mesmo nome,
 * mas o e-mail é único). A foto/nome do banco têm prioridade sobre o que vier
 * embutido na tarefa.
 */
export function makePersonResolver(users: User[]): PersonResolver {
  const byEmail = new Map<string, User>();
  for (const u of users) if (u.email) byEmail.set(u.email.toLowerCase(), u);
  return (ref) => {
    const email = personEmail(ref);
    const u = email ? byEmail.get(email.toLowerCase()) : undefined;
    return {
      email,
      name: u?.name || personName(ref),
      picture: u?.picture || (typeof ref === 'object' ? ref.picture : undefined),
    };
  };
}

export const PersonResolverContext = createContext<PersonResolver>(identityResolver);
export const usePersonResolver = (): PersonResolver => useContext(PersonResolverContext);
