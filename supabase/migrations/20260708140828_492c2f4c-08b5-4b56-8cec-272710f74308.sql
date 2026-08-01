-- Hide public tables from pg_graphql introspection. App uses REST, not GraphQL.
COMMENT ON TABLE public.badges IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.chats IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.memories IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.messages IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.missions IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.paddle_webhook_events IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.profiles IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.streaks IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.subscriptions IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.usage_daily IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.user_xp IS e'@graphql({"visible": false})';
COMMENT ON TABLE public.xp_events IS e'@graphql({"visible": false})';