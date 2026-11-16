function onEvent(name, value1, value2)
	if name == 'DadGroupX' then
		--setProperty('dadGroup.x', value1)
		doTweenX('dadGroupX', 'dadGroup', value1, 0.0001, 'Linear')
	end
end