import type { GraphQLResolveInfo } from 'graphql';
import type { Show as ShowMapper } from '../data/shows.js';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  _FieldSet: { input: unknown; output: unknown; }
};

/** A person in a show's cast. Lives in a separate data source (a People/Talent service in prod). */
export type Person = {
  __typename?: 'Person';
  /** Stable unique id. */
  id: Scalars['ID']['output'];
  /** Full name, e.g. "Millie Bobby Brown". */
  name: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  /** A single show by id, or null if none matches. Nullable return = the lookup may miss. */
  show?: Maybe<Show>;
  /** All shows in the catalog. */
  shows: Array<Show>;
};


export type QueryShowArgs = {
  id: Scalars['ID']['input'];
};

/** A movie or series in the Netflix catalog. */
export type Show = {
  __typename?: 'Show';
  /** The cast of this show. Fetched from a separate data source per show — the N+1 candidate. */
  cast: Array<Person>;
  /** Stable unique id — the federation @key that other subgraphs reference this Show by. */
  id: Scalars['ID']['output'];
  /** MOVIE or SERIES. */
  kind: ShowKind;
  /** Maturity rating, e.g. "TV-MA", "PG-13". */
  maturityRating: Scalars['String']['output'];
  /** Year the title was first released. */
  releaseYear: Scalars['Int']['output'];
  /** Display title, e.g. "Stranger Things". */
  title: Scalars['String']['output'];
};

/** Whether a Show is a one-off movie or an episodic series. */
export type ShowKind =
  | 'MOVIE'
  | 'SERIES';



export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ReferenceResolver<TResult, TReference, TContext> = (
      reference: TReference,
      context: TContext,
      info: GraphQLResolveInfo
    ) => Promise<TResult> | TResult;

      type ScalarCheck<T, S> = S extends true ? T : NullableCheck<T, S>;
      type NullableCheck<T, S> = Maybe<T> extends T ? Maybe<ListCheck<NonNullable<T>, S>> : ListCheck<T, S>;
      type ListCheck<T, S> = T extends (infer U)[] ? NullableCheck<U, S>[] : GraphQLRecursivePick<T, S>;
      export type GraphQLRecursivePick<T, S> = { [K in keyof T & keyof S]: ScalarCheck<T[K], S[K]> };
    

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

/** Mapping of federation types */
export type FederationTypes = {
  Show: Show;
};

/** Mapping of federation reference types */
export type FederationReferenceTypes = {
  Show:
    ( { __typename: 'Show' }
    & GraphQLRecursivePick<FederationTypes['Show'], {"id":true}> );
};



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Person: ResolverTypeWrapper<Person>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Show: ResolverTypeWrapper<ShowMapper>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  ShowKind: ShowKind;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Person: Person;
  ID: Scalars['ID']['output'];
  String: Scalars['String']['output'];
  Query: Record<PropertyKey, never>;
  Show: ShowMapper;
  Int: Scalars['Int']['output'];
  Boolean: Scalars['Boolean']['output'];
};

export type PersonResolvers<ContextType = any, ParentType extends ResolversParentTypes['Person'] = ResolversParentTypes['Person']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  show?: Resolver<Maybe<ResolversTypes['Show']>, ParentType, ContextType, RequireFields<QueryShowArgs, 'id'>>;
  shows?: Resolver<Array<ResolversTypes['Show']>, ParentType, ContextType>;
};

export type ShowResolvers<ContextType = any, ParentType extends ResolversParentTypes['Show'] = ResolversParentTypes['Show'], FederationReferenceType extends FederationReferenceTypes['Show'] = FederationReferenceTypes['Show']> = {
  __resolveReference?: ReferenceResolver<Maybe<ResolversTypes['Show']> | FederationReferenceType, FederationReferenceType, ContextType>;
  cast?: Resolver<Array<ResolversTypes['Person']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  kind?: Resolver<ResolversTypes['ShowKind'], ParentType, ContextType>;
  maturityRating?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  releaseYear?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  Person?: PersonResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Show?: ShowResolvers<ContextType>;
};

