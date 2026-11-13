const date = house.data ? house.data.move_in_date : null;
const monthNumber = date ? parseInt(date.substring(5, 7), 10) : null;
const year = date ? parseInt(date.substring(0, 4), 10) : null;

return [monthNumber, year];
