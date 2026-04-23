-- =====================================================================
-- Optional demo seed. Run AFTER you've signed in once so auth.users exists.
-- Replace <YOUR_USER_ID> with your own UUID from the auth.users table:
--   select id, email from auth.users;
-- =====================================================================

-- \set user_id '00000000-0000-0000-0000-000000000000'

do $$
declare
  v_user uuid := '<YOUR_USER_ID>'::uuid;
  v_assn uuid;
  v_rub  uuid;
  v_stu  uuid;
  v_sub  uuid;
begin
  -- Assignment
  insert into public.assignments (user_id, title, description, total_points)
  values (v_user, 'Biology 101 — Midterm', 'Demo assignment', 10)
  returning id into v_assn;

  -- Rubric + questions
  insert into public.rubrics (assignment_id, user_id, notes)
  values (v_assn, v_user, 'Concise answers expected. Partial credit encouraged.')
  returning id into v_rub;

  insert into public.rubric_questions
    (rubric_id, user_id, position, question_number, prompt, max_points,
     expected_answer, common_mistakes, partial_credit)
  values
    (v_rub, v_user, 0, '1',
     'Define photosynthesis.',
     3,
     'Process by which green plants convert light energy into chemical energy (glucose) using CO2 and water, releasing oxygen.',
     'Forgetting to mention oxygen byproduct; confusing with respiration.',
     '1 pt for light→chemical energy; 1 pt for CO2+H2O→glucose; 1 pt for O2 byproduct.'),
    (v_rub, v_user, 1, '2',
     'Name the two main stages of photosynthesis.',
     2,
     'Light-dependent reactions and the Calvin cycle (light-independent).',
     'Only naming one; calling Calvin cycle "dark reactions" is acceptable.',
     '1 pt per correct stage.'),
    (v_rub, v_user, 2, '3',
     'Why is chlorophyll green?',
     2,
     'It absorbs red and blue wavelengths most strongly and reflects green, so the reflected light is what we see.',
     'Saying "it is green" without explaining reflection.',
     '1 pt absorption, 1 pt reflection.'),
    (v_rub, v_user, 3, '4',
     'Balanced equation for photosynthesis.',
     3,
     '6 CO2 + 6 H2O + light → C6H12O6 + 6 O2',
     'Unbalanced coefficients; missing light arrow.',
     '1 pt reactants, 1 pt products, 1 pt coefficients.');

  -- Demo student + submission (no image data; for layout preview only)
  insert into public.students (user_id, name, external_id)
  values (v_user, 'Demo Student', 'S-0001')
  returning id into v_stu;

  insert into public.submissions (assignment_id, student_id, user_id, status, max_score)
  values (v_assn, v_stu, v_user, 'uploaded', 10)
  returning id into v_sub;
end $$;
