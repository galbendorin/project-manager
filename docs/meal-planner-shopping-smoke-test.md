# Meal Planner + Shopping List Smoke Test

Use this checklist before pushing changes that touch Meal Planner, Shopping List, shared households, generated groceries, or meal-plan recipes.

## Setup

- Use a real test week that has no important personal groceries.
- Sign in as the first household user.
- If testing collaboration, open the same household Shopping List and Meal Planner from the second shared account.

## Meal Planner

1. Add one recipe to Monday breakfast.
2. Confirm the recipe card appears and the day totals update.
3. If the recipe is batch-based and leaves leftovers, create a carryover to the next day.
4. Move the carryover forward by one day.
5. Remove the planned recipe and confirm a visible message tells the user to update groceries.

## Grocery Draft

### Meals without a recipe

1. In an empty day/slot, select **Add meal → Type meal name**.
2. Confirm blank or whitespace-only names cannot submit. Type a meal name and choose the audience.
3. Add it to the plan. Confirm the correct day/slot and audience, the **Recipe not added yet** label, and no invented nutrition or grocery lines.
4. Open the meal and use **Add recipe details** later. Save ingredients and confirm the same planned meal now contributes to the grocery draft.
5. In an isolated test environment, fail calendar assignment after the name is saved. Confirm the picker retains the name, explains the partial result, and retry creates one library meal and one planned entry.
6. Repeat with an empty recipe library, a long name, keyboard submission, and phone/desktop widths. Confirm the recipe-choice path and copy-forward still work.
7. Save known calories and macros without ingredients. Confirm the daily totals preserve those values and grocery review still explains the missing ingredients.

### Review and sync

1. Open Review groceries.
2. Confirm the modal explains that generated groceries replace one weekly Meal plan batch.
3. Hide one ingredient, close, reopen, and confirm it stays excluded.
4. Restore the hidden ingredient.
5. Approve the draft into Shopping List.

## Shopping List

1. Confirm generated items appear with Meal plan metadata.
2. Confirm manual groceries are still visible and were not replaced.
3. Return to Meal Planner, remove the recipe, then open Review groceries again.
4. Press Update Shopping List.
5. Confirm generated Meal plan groceries for that week are removed or replaced, while manual groceries remain.

## Shared Household

1. From account A, add or remove a planned meal.
2. From account B, refresh or return focus to Meal Planner and confirm the visible week updates.
3. From account B, approve or update groceries.
4. Confirm the Shopping List does not duplicate generated Meal plan items.

## Mobile

1. Open Meal Planner on a phone-width viewport.
2. Confirm the page does not horizontally overflow.
3. Switch between Plan, Recipes, and Groceries panels.
4. Open and close Review groceries.
5. Confirm scrolling remains smooth enough for normal use.
