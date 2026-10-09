-- Vitalício: R$ 99,90 → R$ 79,90. The server charges the amount stored here (the page only
-- shows src/config/plans.ts, which must say the same). Orders already open keep the amount
-- they were created with. Safe to run more than once.
update lastro.plans set amount_minor = 7990 where id = 'vitalicio';
